/* GuitarLab songs module — bring your own tabs, practice them here.
 *
 * Import path 1: paste ASCII guitar tab (six tab lines, the format every tab
 * site lets you copy). Import path 2: load a standard MIDI file. Both are
 * parsed ENTIRELY in the browser into a shared step sequence
 * [{ notes:[{s,f,midi}], bar }] — no server, no scraping, user-supplied
 * content only.
 *
 * The player is the app's practice engine pointed at a song: lookahead
 * scheduler, tempo shared with the metronome (met.bpm + tempo event), notes
 * per beat, optional click, bar-range looping (A/B), and a normalized tab
 * view with a moving highlight. Detected key can be applied to the whole app
 * (fb:set), so the fretboard / piano / chords pages light up in the song's
 * key. Songs save to a local library (guitarlab.sg.lib).
 * DOM ids / CSS classes are prefixed sg-.
 */
(function () {
  'use strict';

  var els = {};
  var cur = null;      // { name, steps, bars, srcType }
  var curKey = null;   // { root, scaleId, score }

  var STD = Theory.TUNINGS.standard.midi; // [40,45,50,55,59,64] low E .. high e
  var MAX_STEPS = 4000, MAX_NOTES = 8000;

  // ---------------- ASCII tab parsing ----------------
  // Accepts the common six-line format:  e|--5-7-8--|  (any label spelling,
  // labels optional). Multi-digit frets, bars counted from '|'. Stacked
  // systems play one after another. Standard tuning is assumed.

  function isTabLine(line) {
    var t = line.replace(/^\s*[eEbBgGdDaA][#b]?\s*/, '');
    if (!/[-—]/.test(t)) return false;
    var body = t.replace(/^[|:]+/, '');
    if (body.length < 4) return false;
    var okChars = body.replace(/[^-—0-9hpbrsx~.|()\/\\* ]/g, '');
    return okChars.length >= body.length * 0.9 && /[-—]{2}/.test(body);
  }

  function parseAsciiTab(text) {
    var lines = text.split(/\r?\n/);
    var systems = [];
    var run = [];
    for (var i = 0; i <= lines.length; i++) {
      var isTab = i < lines.length && isTabLine(lines[i]);
      if (isTab) run.push(lines[i]);
      else {
        if (run.length >= 6) systems.push(run.slice(0, 6)); // guitar = first 6
        run = [];
      }
    }
    if (!systems.length) return null;

    var steps = [];
    var bar = 0;
    var nNotes = 0;
    systems.forEach(function (sys) {
      // content starts after the label / first pipe on each line
      var bodies = sys.map(function (ln) {
        var m = /^[^|\-—]*[|]?/.exec(ln);
        return ln.slice(m ? m[0].length : 0);
      });
      var len = Math.min.apply(null, bodies.map(function (b) { return b.length; }));
      for (var c = 0; c < len; c++) {
        var notes = [];
        for (var li = 0; li < 6; li++) {
          var ch = bodies[li][c];
          if (ch >= '0' && ch <= '9') {
            // multi-digit guard: only start of a number counts
            if (c > 0 && bodies[li][c - 1] >= '0' && bodies[li][c - 1] <= '9') continue;
            var num = /^\d{1,2}/.exec(bodies[li].slice(c))[0];
            var f = parseInt(num, 10);
            if (f > 24) f = parseInt(num[0], 10); // "15" beyond neck? read "1"+"5" defensively
            var s = 5 - li; // line 0 = high e = string index 5
            notes.push({ s: s, f: f, midi: STD[s] + f });
          }
        }
        // a barline advances the count only when the current bar has content —
        // otherwise trailing "|" plus the system break would mint empty bars
        if (bodies[0][c] === '|' && c > 0 && bodies[0][c - 1] !== '|' &&
            steps.length && steps[steps.length - 1].bar === bar) bar++;
        if (notes.length) {
          nNotes += notes.length;
          steps.push({ notes: notes, bar: bar });
          if (steps.length >= MAX_STEPS || nNotes >= MAX_NOTES) return;
        }
      }
      if (steps.length && steps[steps.length - 1].bar === bar) bar++; // system break
    });
    if (!steps.length) return null;
    // normalize bars to start at 0 contiguously
    var minBar = steps[0].bar;
    steps.forEach(function (st) { st.bar -= minBar; });
    return { steps: steps, bars: steps[steps.length - 1].bar + 1, srcType: 'tab' };
  }

  // ---------------- MIDI parsing ----------------
  // Minimal SMF reader: merges tracks, keeps note-ons (vel>0, not drums),
  // quantizes to a 16ths grid, maps pitches to playable fretboard positions.

  function parseMidiFile(bytes) {
    var d = new Uint8Array(bytes);
    var p = 0;
    function u32() { var v = (d[p] << 24) | (d[p + 1] << 16) | (d[p + 2] << 8) | d[p + 3]; p += 4; return v >>> 0; }
    function u16() { var v = (d[p] << 8) | d[p + 1]; p += 2; return v; }
    function varlen() {
      var v = 0, b;
      do { b = d[p++]; v = (v << 7) | (b & 0x7f); } while (b & 0x80);
      return v;
    }
    if (String.fromCharCode(d[0], d[1], d[2], d[3]) !== 'MThd') return null;
    p = 4; u32(); u16(); var ntrk = u16(); var division = u16();
    if (division & 0x8000) return null; // SMPTE time — not supported
    var events = [];
    for (var t = 0; t < ntrk; t++) {
      if (String.fromCharCode(d[p], d[p + 1], d[p + 2], d[p + 3]) !== 'MTrk') break;
      p += 4;
      var len = u32();
      var end = p + len;
      var tick = 0, status = 0;
      while (p < end) {
        tick += varlen();
        var b = d[p];
        if (b & 0x80) { status = b; p++; }
        if (status === 0xff) {
          var type = d[p++]; var l = varlen(); p += l;
          if (type === 0x2f) break;
        } else if (status === 0xf0 || status === 0xf7) {
          p += varlen();
        } else {
          var hi = status & 0xf0, ch = status & 0x0f;
          if (hi === 0x90 || hi === 0x80 || hi === 0xa0 || hi === 0xb0 || hi === 0xe0) {
            var d1 = d[p++], d2 = d[p++];
            if (hi === 0x90 && d2 > 0 && ch !== 9) events.push({ tick: tick, midi: d1 });
          } else if (hi === 0xc0 || hi === 0xd0) {
            p++;
          } else { p++; } // resync on junk
        }
      }
      p = end;
    }
    if (!events.length) return null;
    events.sort(function (a, b2) { return a.tick - b2.tick; });

    // quantize to 16ths; group simultaneous notes into steps
    var grid = {};
    events.slice(0, MAX_NOTES).forEach(function (ev) {
      var g = Math.round((ev.tick / division) * 4);
      (grid[g] = grid[g] || []).push(ev.midi);
    });
    var keys = Object.keys(grid).map(Number).sort(function (a, b2) { return a - b2; });
    var steps = [];
    var prevFret = 5;
    keys.slice(0, MAX_STEPS).forEach(function (g) {
      var used = {};
      var notes = [];
      grid[g].sort(function (a, b2) { return a - b2; }).slice(0, 6).forEach(function (midi) {
        // fold into the guitar's range, then pick the playable position
        // closest to where the hand already is
        while (midi < STD[0]) midi += 12;
        while (midi > STD[5] + 22) midi -= 12;
        var best = null;
        for (var s = 0; s < 6; s++) {
          if (used[s]) continue;
          var f = midi - STD[s];
          if (f < 0 || f > 22) continue;
          if (!best || Math.abs(f - prevFret) < Math.abs(best.f - prevFret)) best = { s: s, f: f, midi: midi };
        }
        if (best) { used[best.s] = true; notes.push(best); }
      });
      if (notes.length) {
        prevFret = notes[0].f || prevFret;
        steps.push({ notes: notes, bar: Math.floor(g / 16) }); // 16 sixteenths = a 4/4 bar
      }
    });
    if (!steps.length) return null;
    var minBar = steps[0].bar;
    steps.forEach(function (st) { st.bar -= minBar; });
    return { steps: steps, bars: steps[steps.length - 1].bar + 1, srcType: 'midi' };
  }

  // ---------------- key detection ----------------

  function detectKey(steps) {
    var counts = new Array(12).fill(0);
    var total = 0, lastPc = null;
    steps.forEach(function (st) {
      st.notes.forEach(function (n) {
        var pc = Theory.mod12(n.midi);
        counts[pc]++; total++; lastPc = pc;
      });
    });
    if (!total) return null;
    var best = null;
    Theory.SCALE_ORDER.forEach(function (scaleId) {
      var sc = Theory.SCALES[scaleId];
      if (sc.steps.length < 5) return;
      for (var root = 0; root < 12; root++) {
        var inScale = 0;
        for (var pc = 0; pc < 12; pc++) {
          if (sc.steps.indexOf(Theory.mod12(pc - root)) !== -1) inScale += counts[pc];
        }
        var unused = 0;
        sc.steps.forEach(function (st) { if (!counts[Theory.mod12(root + st)]) unused++; });
        var score = inScale / total +
          0.25 * (counts[root] / total) +           // tonic should be common
          (lastPc === root ? 0.08 : 0) +            // songs tend to land home
          (scaleId === 'major' || scaleId === 'aeolian' ? 0.03 : 0) - // prefer plain keys over exotic ties
          0.02 * unused;                            // exact fits beat supersets (pent lick ≠ full minor)
        if (!best || score > best.score) best = { root: root, scaleId: scaleId, score: score };
      }
    });
    return best;
  }

  // ---------------- library (localStorage) ----------------

  function libGet() {
    var l = App.store.get('sg.lib', []);
    return Array.isArray(l) ? l : [];
  }

  function libSave(list) { App.store.set('sg.lib', list); }

  function renderLib() {
    var list = libGet();
    if (!list.length) {
      els.lib.innerHTML = '<span class="muted small">Nothing saved yet — parse a song and hit Save.</span>';
      return;
    }
    var h = '';
    list.forEach(function (it, i) {
      h += '<span class="chip sg-libchip" data-sgload="' + i + '" title="Load">' + escapeHtml(it.name) +
        ' <span class="muted">&middot; ' + it.bars + ' bars</span></span>' +
        '<button type="button" class="btn sm danger" data-sgdel="' + i + '" title="Delete" aria-label="Delete ' +
        escapeHtml(it.name) + '">' + App.icon('close', 12) + '</button>';
    });
    els.lib.innerHTML = h;
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  // ---------------- player ----------------

  var pl = {
    running: false, idx: 0, seq: [], bpm: 120, rate: 2, click: false,
    loopA: 0, loopB: 0, timer: null, raf: 0, nextT: 0, vis: [], ctx: null
  };

  function plSeq() {
    if (!cur) return [];
    var a = Math.min(pl.loopA, pl.loopB), b = Math.max(pl.loopA, pl.loopB);
    var seq = [];
    for (var i = 0; i < cur.steps.length; i++) {
      if (cur.steps[i].bar >= a && cur.steps[i].bar <= b) seq.push(i);
    }
    return seq;
  }

  function plBtn(running) {
    els.play.innerHTML = running ? App.icon('pause', 14) + ' Pause' : App.icon('play', 14) + ' Play';
  }

  function plStatus(msg) { els.status.textContent = msg || ''; }

  function plTick() {
    if (pl.nextT < pl.ctx.currentTime + 0.01) pl.nextT = pl.ctx.currentTime + 0.05;
    var horizon = pl.ctx.currentTime + 0.25;
    while (pl.nextT < horizon) {
      var stepIdx = pl.seq[pl.idx % pl.seq.length];
      var st = cur.steps[stepIdx];
      var when = pl.nextT - pl.ctx.currentTime;
      var spn = 60 / pl.bpm / pl.rate;
      var dur = Math.max(0.5, Math.min(1.7, spn * 1.6));
      for (var i = 0; i < st.notes.length; i++) {
        App.pluck(st.notes[i].midi, when + i * 0.008, dur, st.notes.length > 1 ? 0.3 : 0.38);
      }
      if (pl.click && pl.idx % pl.rate === 0) {
        var o = pl.ctx.createOscillator(), gn = pl.ctx.createGain();
        o.type = 'sine';
        o.frequency.value = 1150;
        gn.gain.setValueAtTime(0.13, pl.nextT);
        gn.gain.exponentialRampToValueAtTime(0.0001, pl.nextT + 0.03);
        o.connect(gn); gn.connect(pl.ctx.destination);
        o.start(pl.nextT); o.stop(pl.nextT + 0.05);
      }
      pl.vis.push({ t: pl.nextT, step: stepIdx });
      if (pl.vis.length > 64) pl.vis.shift();
      pl.idx++;
      pl.nextT += spn;
    }
  }

  function plDraw() {
    if (!pl.running) return;
    var now = pl.ctx.currentTime;
    var hit = null;
    while (pl.vis.length && pl.vis[0].t <= now) hit = pl.vis.shift();
    if (hit) {
      var prev = els.tabout.querySelector('.now');
      if (prev) prev.classList.remove('now');
      var el = els.tabout.querySelector('[data-sgstep="' + hit.step + '"]');
      if (el) {
        el.classList.add('now');
        if (el.scrollIntoView) el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
      }
      plStatus('bar ' + (cur.steps[hit.step].bar + 1) + ' / ' + cur.bars);
    }
    pl.raf = requestAnimationFrame(plDraw);
  }

  function plStart() {
    if (!cur) { plStatus('load a song first'); return; }
    pl.seq = plSeq();
    if (!pl.seq.length) { plStatus('loop range is empty'); return; }
    try { pl.ctx = App.getAudio(); } catch (e) { plStatus('audio unavailable'); return; }
    if (pl.idx >= pl.seq.length) pl.idx = 0;
    pl.vis.length = 0;
    pl.nextT = pl.ctx.currentTime + 0.15;
    pl.running = true;
    App.wake.acquire('sg-run');
    pl.timer = setInterval(plTick, 25);
    plTick();
    pl.raf = requestAnimationFrame(plDraw);
    plBtn(true);
  }

  function plPause() {
    if (!pl.running) return;
    if (pl.timer) { clearInterval(pl.timer); pl.timer = null; }
    if (pl.raf) { cancelAnimationFrame(pl.raf); pl.raf = 0; }
    pl.running = false;
    pl.vis.length = 0;
    App.wake.release('sg-run');
    plBtn(false);
  }

  function plStop() {
    plPause();
    pl.idx = 0;
    var prev = els.tabout.querySelector('.now');
    if (prev) prev.classList.remove('now');
    plStatus('');
  }

  // ---------------- song display (normalized tab, spans per step) ----------------

  var LINE_LABELS = ['e', 'B', 'G', 'D', 'A', 'E']; // top row = high e (string 5)

  function renderSong() {
    if (!cur) {
      els.tabout.innerHTML = '<span class="muted">Paste a tab or import a MIDI file to get started.</span>';
      els.songTitle.textContent = 'No song loaded';
      els.keyline.style.display = 'none';
      return;
    }
    els.songTitle.textContent = cur.name + ' · ' + cur.bars + ' bar' + (cur.bars === 1 ? '' : 's') +
      (cur.srcType === 'midi' ? ' · from MIDI' : ' · from tab');

    // chunk into systems of ~24 steps, bar-aligned where possible
    var PER = 24;
    var html = '';
    for (var start = 0; start < cur.steps.length; start += PER) {
      var chunk = cur.steps.slice(start, start + PER);
      var rows = LINE_LABELS.map(function (l) { return l + '|'; });
      chunk.forEach(function (st, k) {
        var idx = start + k;
        var width = 1;
        st.notes.forEach(function (n) { width = Math.max(width, String(n.f).length); });
        var byString = {};
        st.notes.forEach(function (n) { byString[n.s] = n.f; });
        var prevBar = idx > 0 ? cur.steps[idx - 1].bar : st.bar;
        var barMark = st.bar !== prevBar;
        for (var li = 0; li < 6; li++) {
          var s = 5 - li;
          var cell = byString[s] === undefined ? '' : String(byString[s]);
          while (cell.length < width) cell += '-';
          rows[li] += (barMark ? '|' : '') +
            '<span data-sgstep="' + idx + '">' + cell + '</span>-';
        }
      });
      html += rows.map(function (r) { return r + '|'; }).join('\n') + '\n\n';
    }
    els.tabout.innerHTML = html;

    // key detection line
    curKey = detectKey(cur.steps);
    if (curKey) {
      var pf = Theory.FLAT_KEYS.has(curKey.root);
      els.keyname.textContent = Theory.pcName(curKey.root, pf) + ' ' + Theory.SCALES[curKey.scaleId].name;
      els.keyline.style.display = '';
    } else {
      els.keyline.style.display = 'none';
    }

    // loop selectors follow the song length
    var opts = '';
    for (var b = 1; b <= cur.bars; b++) opts += '<option value="' + (b - 1) + '">' + b + '</option>';
    els.loopA.innerHTML = opts;
    els.loopB.innerHTML = opts;
    pl.loopA = 0;
    pl.loopB = cur.bars - 1;
    els.loopA.value = '0';
    els.loopB.value = String(cur.bars - 1);
  }

  function loadSong(song) {
    plStop();
    cur = song;
    renderSong();
  }

  // ---------------- init ----------------

  function init(rootEl) {
    App.injectCSS('songs',
      '.sg-tabout{font-family:ui-monospace,Consolas,Menlo,monospace;line-height:1.55;overflow-x:auto;' +
        'background:var(--card2);border:1px solid var(--line);border-radius:10px;' +
        'padding:14px 16px;color:var(--text);white-space:pre;min-height:110px;font-size:13px}' +
      '.sg-tabout span[data-sgstep]{font-weight:700;border-radius:3px}' +
      '.sg-tabout span.now{background:var(--accent);color:#1c1206;box-shadow:0 0 10px var(--accent-glow)}' +
      '.sg-paste{width:100%;min-height:130px;font-family:ui-monospace,Consolas,Menlo,monospace;font-size:12.5px;' +
        'background-color:var(--card2);color:var(--text);border:1px solid var(--ctl-border);border-radius:10px;padding:10px 12px}' +
      '.sg-paste:focus{outline:none;border-color:rgba(255,171,71,0.6)}' +
      '.sg-title{font-family:var(--font-display);font-size:19px;font-weight:600;letter-spacing:1px;text-transform:uppercase}' +
      '.sg-libchip{cursor:pointer}' +
      '.sg-libchip:hover{border-color:rgba(255,171,71,0.7)}' +
      '.sg-strip{margin-top:12px}' +
      '.sg-strip select{padding:6px 26px 6px 9px;font-size:13px;background-position:right 8px center}' +
      '.sg-strip input[type=number]{padding:6px 8px;font-size:13px}' +
      '#sg-file{display:none}'
    );

    rootEl.innerHTML =
      '<div class="card">' +
        '<h2>Add a song</h2>' +
        '<div class="muted small" style="margin-bottom:8px">Paste an ASCII guitar tab (the six-line kind you can copy from any tab site) ' +
          'or import a MIDI file. Everything is parsed on your device &mdash; nothing is uploaded, and only content you bring in is used. Standard tuning is assumed.</div>' +
        '<textarea class="sg-paste" id="sg-paste" spellcheck="false" placeholder="e|--0--1--3--1--0-------|&#10;B|-------------------3--|&#10;G|----------------------|&#10;D|----------------------|&#10;A|----------------------|&#10;E|----------------------|"></textarea>' +
        '<div class="row tight" style="margin-top:10px">' +
          '<button type="button" class="btn sm primary" id="sg-parse">Parse tab</button>' +
          '<button type="button" class="btn sm" id="sg-midibtn">Import MIDI&hellip;</button>' +
          '<input type="file" id="sg-file" accept=".mid,.midi,audio/midi">' +
          '<input type="text" id="sg-name" placeholder="Song name" style="width:180px">' +
          '<button type="button" class="btn sm" id="sg-save" disabled>Save to library</button>' +
          '<span class="muted small" id="sg-addmsg"></span>' +
        '</div>' +
        '<div class="row tight" id="sg-lib" style="margin-top:12px"></div>' +
      '</div>' +
      '<div class="card">' +
        '<div class="row tight spread">' +
          '<span class="sg-title" id="sg-songtitle">No song loaded</span>' +
          '<span class="row tight" id="sg-keyline" style="display:none">' +
            '<span class="muted small">Detected key:</span>' +
            '<span class="chip" id="sg-keyname"></span>' +
            '<button type="button" class="btn sm" id="sg-applykey" title="Set the whole app to this key and scale — fretboard, piano and chords follow">Apply to app</button>' +
          '</span>' +
        '</div>' +
        '<div class="row tight sg-strip">' +
          '<button type="button" class="btn sm primary" id="sg-play">' + App.icon('play', 14) + ' Play</button>' +
          '<button type="button" class="btn sm" id="sg-reset" title="Back to the start">' + App.icon('restart', 14) + '</button>' +
          '<label class="row tight small muted" style="gap:5px">Loop bars <select id="sg-loopa"></select>' +
            App.icon('right', 12) + '<select id="sg-loopb"></select></label>' +
          '<input type="number" id="sg-bpm" min="30" max="280" step="1" title="Tempo (BPM) — linked to the metronome" style="width:70px">' +
          '<select id="sg-rate" title="Steps per beat — slow a song down without changing the click">' +
            '<option value="1">1 / beat</option>' +
            '<option value="2">8ths</option>' +
            '<option value="3">Triplets</option>' +
            '<option value="4">16ths</option>' +
          '</select>' +
          '<label class="row tight small muted" style="gap:5px"><input type="checkbox" id="sg-click">Click</label>' +
          '<span class="muted small" id="sg-status"></span>' +
        '</div>' +
        '<div class="sg-tabout" id="sg-tabout" style="margin-top:12px"></div>' +
        '<div class="muted small" style="margin-top:10px">Notes play with your chosen guitar tone (Settings). ' +
          'Rhythm is even steps &mdash; use the tempo and steps-per-beat to slow a passage down, and the loop to drill a section.</div>' +
      '</div>';

    els.paste = document.getElementById('sg-paste');
    els.lib = document.getElementById('sg-lib');
    els.songTitle = document.getElementById('sg-songtitle');
    els.tabout = document.getElementById('sg-tabout');
    els.keyline = document.getElementById('sg-keyline');
    els.keyname = document.getElementById('sg-keyname');
    els.play = document.getElementById('sg-play');
    els.status = document.getElementById('sg-status');
    els.loopA = document.getElementById('sg-loopa');
    els.loopB = document.getElementById('sg-loopb');
    els.name = document.getElementById('sg-name');
    els.save = document.getElementById('sg-save');
    els.addmsg = document.getElementById('sg-addmsg');

    pl.bpm = Math.max(30, Math.min(280, parseInt(App.store.get('met.bpm', 120), 10) || 120));
    pl.rate = App.store.get('sg.rate', 2);
    if ([1, 2, 3, 4].indexOf(pl.rate) === -1) pl.rate = 2;
    pl.click = !!App.store.get('sg.click', false);

    var bpmInp = document.getElementById('sg-bpm');
    bpmInp.value = String(pl.bpm);
    bpmInp.addEventListener('change', function () {
      var v = parseInt(this.value, 10);
      if (isNaN(v)) v = 120;
      v = Math.max(30, Math.min(280, v));
      this.value = String(v);
      pl.bpm = v;
      App.store.set('met.bpm', v);
      App.emit('tempo', { bpm: v, source: 'sg' });
    });
    App.on('tempo', function (d) {
      if (!d || d.source === 'sg') return;
      pl.bpm = Math.max(30, Math.min(280, Math.round(d.bpm)));
      bpmInp.value = String(pl.bpm);
    });

    var rateSel = document.getElementById('sg-rate');
    rateSel.value = String(pl.rate);
    rateSel.addEventListener('change', function () {
      var v = parseInt(this.value, 10);
      pl.rate = (v >= 1 && v <= 4) ? v : 2;
      App.store.set('sg.rate', pl.rate);
    });

    var clickChk = document.getElementById('sg-click');
    clickChk.checked = pl.click;
    clickChk.addEventListener('change', function () {
      pl.click = !!this.checked;
      App.store.set('sg.click', pl.click);
    });

    els.loopA.addEventListener('change', function () {
      pl.loopA = parseInt(this.value, 10) || 0;
      pl.idx = 0;
    });
    els.loopB.addEventListener('change', function () {
      pl.loopB = parseInt(this.value, 10) || 0;
      pl.idx = 0;
    });

    els.play.addEventListener('click', function () { if (pl.running) plPause(); else plStart(); });
    document.getElementById('sg-reset').addEventListener('click', plStop);

    document.getElementById('sg-parse').addEventListener('click', function () {
      var parsed = parseAsciiTab(els.paste.value);
      if (!parsed) { els.addmsg.textContent = 'No six-line tab found — check the paste.'; return; }
      parsed.name = els.name.value.trim() || 'Pasted tab';
      els.name.value = ''; // consumed — the next import starts fresh
      els.addmsg.textContent = 'Parsed: ' + parsed.steps.length + ' steps, ' + parsed.bars + ' bars.';
      els.save.disabled = false;
      loadSong(parsed);
    });

    document.getElementById('sg-midibtn').addEventListener('click', function () {
      document.getElementById('sg-file').click();
    });
    document.getElementById('sg-file').addEventListener('change', function () {
      var file = this.files && this.files[0];
      if (!file) return;
      var self = this;
      var rd = new FileReader();
      rd.onload = function () {
        var parsed = null;
        try { parsed = parseMidiFile(rd.result); } catch (e) { /* malformed */ }
        if (!parsed) { els.addmsg.textContent = 'Could not read that MIDI file.'; return; }
        parsed.name = els.name.value.trim() || file.name.replace(/\.(mid|midi)$/i, '');
        els.name.value = ''; // consumed — the next import starts fresh
        els.addmsg.textContent = 'Imported: ' + parsed.steps.length + ' steps, ' + parsed.bars + ' bars.';
        els.save.disabled = false;
        loadSong(parsed);
        self.value = '';
      };
      rd.readAsArrayBuffer(file);
    });

    els.save.addEventListener('click', function () {
      if (!cur) return;
      var list = libGet();
      var name = els.name.value.trim() || cur.name || 'Song';
      cur.name = name;
      list.push({ name: name, steps: cur.steps, bars: cur.bars, srcType: cur.srcType });
      try {
        libSave(list);
        els.addmsg.textContent = 'Saved "' + name + '".';
      } catch (e) {
        els.addmsg.textContent = 'Could not save (storage full?).';
      }
      renderLib();
      renderSong();
    });

    els.lib.addEventListener('click', function (e) {
      var del = e.target.closest('[data-sgdel]');
      if (del) {
        var list = libGet();
        list.splice(parseInt(del.getAttribute('data-sgdel'), 10), 1);
        libSave(list);
        renderLib();
        return;
      }
      var chip = e.target.closest('[data-sgload]');
      if (chip) {
        var it = libGet()[parseInt(chip.getAttribute('data-sgload'), 10)];
        if (it) {
          els.save.disabled = true;
          loadSong({ name: it.name, steps: it.steps, bars: it.bars, srcType: it.srcType });
        }
      }
    });

    document.getElementById('sg-applykey').addEventListener('click', function () {
      if (!curKey) return;
      App.store.set('fb.root', curKey.root);
      App.store.set('fb.scale', curKey.scaleId);
      App.store.set('fb.mode', 1);
      App.emit('fb:set', { source: 'sg', root: curKey.root, scale: curKey.scaleId, mode: 1 });
    });

    // tapping a step in the tab plays it and moves the playhead there
    els.tabout.addEventListener('click', function (e) {
      var sp = e.target.closest('[data-sgstep]');
      if (!sp || !cur) return;
      var idx = parseInt(sp.getAttribute('data-sgstep'), 10);
      var st = cur.steps[idx];
      if (!st) return;
      try {
        App.getAudio();
        st.notes.forEach(function (n, i) { App.pluck(n.midi, i * 0.008, 1.2, 0.35); });
      } catch (err) { /* audio unavailable */ }
      var seq = plSeq();
      var at = seq.indexOf(idx);
      if (at !== -1) pl.idx = at;
      var prev = els.tabout.querySelector('.now');
      if (prev) prev.classList.remove('now');
      sp.classList.add('now');
    });

    document.addEventListener('visibilitychange', function () {
      if (document.hidden) plPause();
    });

    renderLib();
    renderSong();
  }

  function onHide() {
    plPause();
  }

  App.register('songs', {
    init: init,
    onHide: onHide
  });
})();
