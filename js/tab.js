/* Tablature page — the current practice exercise written out as guitar tab.
 *
 * Fully linked with the Fretboard: both pages read and write the same stored
 * state (fb.root, fb.scale, fb.mode, fb.pr.pattern, fb.pr.dir). Changes made
 * here are pushed to the live fretboard via the fb:set bus event; changes made
 * there are picked up in onShow (only one page is visible at a time).
 *
 * View options (this page only): orientation (horizontal tab lines, or
 * vertical with time flowing down), fit (wrap into screen-width systems, or
 * one scrolling line), and text size.
 */
(function () {
  'use strict';

  var els = {};

  var st = {
    root: 9, scale: 'minorPent', mode: 1,
    pattern: 'scale', dir: 'up',
    orient: 'h',       // 'h' classic lines | 'v' time flows down
    fit: 'fit',        // 'fit' wrap to screen | 'scroll' one long line
    size: 'm'          // s | m | l
  };

  var SIZES = { s: 11, m: 13.5, l: 17 };

  function loadShared() {
    var g = App.store.get;
    var r = g('fb.root', 9);
    if (typeof r === 'number' && isFinite(r) && r >= 0 && r < 12) st.root = Math.floor(r);
    var sc = g('fb.scale', 'minorPent');
    if (Theory.SCALES[sc]) st.scale = sc;
    var m = g('fb.mode', 1);
    if (typeof m === 'number' && m >= 1 && m <= 7) st.mode = Math.floor(m);
    var p = g('fb.pr.pattern', 'scale');
    if (/^(scale|g[3-7]|i([2-9]|1[0-6]))$/.test(p)) st.pattern = p;
    var d = g('fb.pr.dir', 'up');
    if (/^(up|down|updown)$/.test(d)) st.dir = d;
  }

  function loadOwn() {
    var g = App.store.get;
    var o = g('tab.orient', 'h');
    if (o === 'h' || o === 'v') st.orient = o;
    var f = g('tab.fit', 'fit');
    if (f === 'fit' || f === 'scroll') st.fit = f;
    var s = g('tab.size', 'm');
    if (SIZES[s]) st.size = s;
  }

  // push a shared-state change to storage AND the live fretboard
  function shareChange(patch) {
    if ('pattern' in patch) App.store.set('fb.pr.pattern', st.pattern);
    if ('dir' in patch) App.store.set('fb.pr.dir', st.dir);
    App.emit('fb:set', { source: 'tab', pattern: st.pattern, dir: st.dir });
  }

  function preferFlat() { return Theory.FLAT_KEYS.has(Theory.mod12(st.root)); }
  function isHept() { return Theory.SCALES[st.scale].steps.length === 7; }

  function tuningId() {
    var tu = App.store.get('fb.tuning', 'standard');
    return Theory.TUNINGS[tu] ? tu : 'standard';
  }

  function maxFret() {
    var fr = App.store.get('fb.frets', 24);
    return (fr === 12 || fr === 15 || fr === 22 || fr === 24) ? fr : 24;
  }

  // ---------------- rendering ----------------

  function exercise() {
    var path = Theory.exercisePath({
      rootPc: st.root, scaleId: st.scale, tuningId: tuningId(),
      maxFret: maxFret(), mode: st.mode, pentBox: 0
    });
    var seq = Theory.exerciseSeq(path.length, st.pattern, st.dir);
    return { path: path, seq: seq };
  }

  function stringLabels() {
    var tun = Theory.TUNINGS[tuningId()];
    var pf = preferFlat();
    var out = [];
    for (var s = 0; s < 6; s++) out.push(Theory.pcName(Theory.mod12(tun.midi[s]), pf));
    return out;
  }

  // one horizontal system for seq columns [from, to)
  function systemText(path, seq, labels, from, to) {
    var rows = [];
    var s, i, r;
    var lw = 0;
    for (s = 0; s < 6; s++) if (labels[s].length > lw) lw = labels[s].length;
    for (s = 5; s >= 0; s--) {
      var pad = new Array(lw - labels[s].length + 1).join(' ');
      rows.push({ s: s, text: labels[s] + pad + '|' });
    }
    for (i = from; i < to; i++) {
      var n = path[seq[i]];
      var w = String(n.f).length + 2;
      for (r = 0; r < rows.length; r++) {
        rows[r].text += rows[r].s === n.s ? '-' + n.f + '-' : new Array(w + 1).join('-');
      }
    }
    return rows.map(function (row) { return row.text + '|'; }).join('\n');
  }

  function renderTab() {
    var ex = exercise();
    var labels = stringLabels();
    var out = els.out;
    out.style.fontSize = SIZES[st.size] + 'px';
    els.count.textContent = ex.seq.length ? ex.seq.length + ' notes' : '';
    if (!ex.seq.length) {
      out.textContent = '(no notes in this window)';
      return;
    }

    if (st.orient === 'v') {
      // vertical: strings as columns (low E left, matching the vertical
      // fretboard), each exercise step is a row flowing downward
      var head = '', i, s;
      for (s = 0; s < 6; s++) head += (labels[s] + '   ').slice(0, 3);
      var lines = [head.replace(/\s+$/, '')];
      for (i = 0; i < ex.seq.length; i++) {
        var n = ex.path[ex.seq[i]];
        var line = '';
        for (s = 0; s < 6; s++) {
          line += s === n.s ? (String(n.f) + '   ').slice(0, 3) : '·  ';
        }
        lines.push(line.replace(/\s+$/, ''));
      }
      out.classList.add('tb-vert');
      out.textContent = lines.join('\n');
      return;
    }

    out.classList.remove('tb-vert');
    if (st.fit === 'scroll') {
      out.textContent = systemText(ex.path, ex.seq, labels, 0, ex.seq.length);
      return;
    }

    // fit: wrap into systems that fit the panel width
    var charW = SIZES[st.size] * 0.602;                 // monospace advance
    var usable = Math.max(160, out.clientWidth - 30);
    var lw = Math.max.apply(null, labels.map(function (l) { return l.length; }));
    var budget = Math.floor(usable / charW) - lw - 2;   // label + two pipes
    var systems = [];
    var i = 0;
    while (i < ex.seq.length) {
      var used = 0, j = i;
      while (j < ex.seq.length) {
        var cw = String(ex.path[ex.seq[j]].f).length + 2;
        if (used + cw > budget && j > i) break;
        used += cw;
        j++;
      }
      systems.push(systemText(ex.path, ex.seq, labels, i, j));
      i = j;
    }
    out.textContent = systems.join('\n\n');
  }

  function renderKey() {
    var name = Theory.pcName(st.root, preferFlat()) + ' ' + Theory.SCALES[st.scale].name;
    if (isHept() && st.mode > 1) {
      var info = Theory.scaleInfo(st.root, st.scale, preferFlat());
      name += ' \u00b7 mode ' + st.mode + ' (' + info.names[st.mode - 1] + ')';
    }
    els.key.textContent = name;
  }

  function paintSegs() {
    [['dirSeg', 'data-tbdir', st.dir], ['oriSeg', 'data-tbori', st.orient],
     ['fitSeg', 'data-tbfit', st.fit], ['sizeSeg', 'data-tbsize', st.size]]
      .forEach(function (cfg) {
        els[cfg[0]].querySelectorAll('button').forEach(function (b) {
          b.classList.toggle('active', b.getAttribute(cfg[1]) === cfg[2]);
        });
      });
    els.fitSeg.style.display = st.orient === 'v' ? 'none' : ''; // vertical always fits
  }

  function renderAll() {
    renderKey();
    paintSegs();
    renderTab();
  }

  // ---------------- boot ----------------

  function init(rootEl) {
    App.injectCSS('tabpage',
      '.tb-out{font-family:ui-monospace,Consolas,Menlo,monospace;line-height:1.55;overflow-x:auto;' +
        'background:var(--card2);border:1px solid var(--line);border-radius:10px;' +
        'padding:14px 16px;margin:0;color:var(--text);white-space:pre;min-height:120px}' +
      '.tb-out.tb-vert{letter-spacing:2px}' +
      '.tb-field{display:inline-flex;flex-direction:column;gap:4px;font-size:12.5px;' +
        'color:var(--muted);font-weight:600}'
    );

    loadShared();
    loadOwn();

    var patOpts = '', i;
    patOpts = '<option value="scale">Scale</option><optgroup label="Groups">';
    for (i = 3; i <= 7; i++) patOpts += '<option value="g' + i + '">' + i + 's</option>';
    patOpts += '</optgroup><optgroup label="Intervals">';
    var IVL = { 2: '2nds', 3: '3rds', 4: '4ths', 5: '5ths', 6: '6ths', 7: '7ths', 8: 'Octaves',
      9: '9ths', 10: '10ths', 11: '11ths', 12: '12ths', 13: '13ths', 14: '14ths', 15: '15ths', 16: '16ths' };
    for (i = 2; i <= 16; i++) patOpts += '<option value="i' + i + '">' + IVL[i] + '</option>';
    patOpts += '</optgroup>';

    rootEl.innerHTML =
      '<div class="card">' +
        '<h2>Tablature</h2>' +
        '<div class="row">' +
          '<span class="chip" id="tb-key" title="Key, scale, and mode come from the bar at the top"></span>' +
          '<label class="field">Pattern<select id="tb-pattern">' + patOpts + '</select></label>' +
          '<div class="tb-field">Direction' +
            '<div class="seg" id="tb-dir">' +
              '<button type="button" data-tbdir="up" title="Ascending">&#8593;</button>' +
              '<button type="button" data-tbdir="down" title="Descending">&#8595;</button>' +
              '<button type="button" data-tbdir="updown" title="Up, then back down">&#8597;</button>' +
            '</div>' +
          '</div>' +
        '</div>' +
        '<div class="row tight" style="margin-top:10px">' +
          '<div class="tb-field">Orientation' +
            '<div class="seg" id="tb-ori">' +
              '<button type="button" data-tbori="h">Horizontal</button>' +
              '<button type="button" data-tbori="v">Vertical</button>' +
            '</div>' +
          '</div>' +
          '<div class="tb-field">Layout' +
            '<div class="seg" id="tb-fit">' +
              '<button type="button" data-tbfit="fit" title="Wrap into lines that fit the screen">Fit</button>' +
              '<button type="button" data-tbfit="scroll" title="One long line, scroll sideways">Scroll</button>' +
            '</div>' +
          '</div>' +
          '<div class="tb-field">Size' +
            '<div class="seg" id="tb-size">' +
              '<button type="button" data-tbsize="s">S</button>' +
              '<button type="button" data-tbsize="m">M</button>' +
              '<button type="button" data-tbsize="l">L</button>' +
            '</div>' +
          '</div>' +
          '<span class="muted small" id="tb-count"></span>' +
          '<button type="button" class="btn sm" id="tb-open" title="See this exercise on the fretboard">Fretboard &rarr;</button>' +
        '</div>' +
        '<pre class="tb-out" id="tb-out" style="margin-top:14px"></pre>' +
      '</div>';

    els.key = document.getElementById('tb-key');
    els.pattern = document.getElementById('tb-pattern');
    els.dirSeg = document.getElementById('tb-dir');
    els.oriSeg = document.getElementById('tb-ori');
    els.fitSeg = document.getElementById('tb-fit');
    els.sizeSeg = document.getElementById('tb-size');
    els.out = document.getElementById('tb-out');
    els.count = document.getElementById('tb-count');

    els.pattern.value = st.pattern;

    els.pattern.addEventListener('change', function () {
      st.pattern = this.value; shareChange({ pattern: 1 }); renderTab();
    });
    els.dirSeg.addEventListener('click', function (e) {
      var b = e.target.closest('button[data-tbdir]');
      if (!b) return;
      st.dir = b.getAttribute('data-tbdir');
      shareChange({ dir: 1 });
      paintSegs(); renderTab();
    });
    els.oriSeg.addEventListener('click', function (e) {
      var b = e.target.closest('button[data-tbori]');
      if (!b) return;
      st.orient = b.getAttribute('data-tbori');
      App.store.set('tab.orient', st.orient);
      paintSegs(); renderTab();
    });
    els.fitSeg.addEventListener('click', function (e) {
      var b = e.target.closest('button[data-tbfit]');
      if (!b) return;
      st.fit = b.getAttribute('data-tbfit');
      App.store.set('tab.fit', st.fit);
      paintSegs(); renderTab();
    });
    els.sizeSeg.addEventListener('click', function (e) {
      var b = e.target.closest('button[data-tbsize]');
      if (!b) return;
      st.size = b.getAttribute('data-tbsize');
      App.store.set('tab.size', st.size);
      paintSegs(); renderTab();
    });
    document.getElementById('tb-open').addEventListener('click', function () {
      App.switchTo('fretboard');
    });

    // fretboard changes while THIS page is visible (e.g. a Trainer Go)
    App.on('fb:scale', function (d) {
      if (!d) return;
      loadShared();
      if (App.active === 'tab') renderAll();
    });
    // mode/pattern/dir pushed from the bar or a fullscreen swipe
    App.on('fb:set', function (d) {
      if (!d || d.source === 'tab') return;
      loadShared();
      els.pattern.value = st.pattern;
      if (App.active === 'tab') renderAll();
    });

    window.addEventListener('resize', function () {
      if (App.active === 'tab' && st.orient === 'h' && st.fit === 'fit') renderTab();
    });

    renderAll();
  }

  function onShow() {
    // the bar / fretboard / trainer may have changed shared state — re-read
    loadShared();
    els.pattern.value = st.pattern;
    renderAll();
  }

  App.register('tab', { init: init, onShow: onShow });
})();
