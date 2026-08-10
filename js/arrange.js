/* soundLAB arrange view — stacked track lanes on a beat timeline. Prefix ar-.
 * The OpenStudio Arranger, rebuilt in soundLAB's idiom on the ported
 * beat-domain transport (DAW.engine song mode).
 *
 * Smoothness rules (the prime directive):
 *   - the playhead is ONE div moved by transform in a rAF loop reading the
 *     audio clock — no layout, no React-style re-render, no per-frame DOM
 *     rebuilds
 *   - clips are cheap absolutely-positioned divs; waveforms render ONCE to a
 *     small canvas per clip (peaks cached per buffer), never per frame
 *   - grid lines are CSS gradients sized to the zoom — zero DOM
 *   - dragging mutates only the dragged divs' transforms; the model commits
 *     on pointerup
 *   - meters draw only while the transport runs
 * Clips: {id, start, len (beats), src:'pattern'|'audio'} on each track
 * (persisted with st.tracks). Ruler: tap = seek, drag = loop region.
 */
(function () {
  'use strict';

  var LANE_H = 56;
  var RULER_H = 26;
  var els = {};
  var sel = [];          // selected clip ids
  var zoomX = 24;        // px per beat
  var snapV = 1;         // beats; 0 = free
  var follow = true;
  var meterRaf = 0;
  var phRaf = 0;

  function tracks() { return DAW.engine.tracks; }

  function save() { App.store.set('st.tracks', tracks()); }

  function trackById(id) {
    var out = null;
    tracks().forEach(function (t) { if (t.id === id) out = t; });
    return out;
  }

  function clipById(id) {
    var out = null;
    tracks().forEach(function (t) {
      (t.clips || []).forEach(function (c) { if (c.id === id) out = { clip: c, track: t }; });
    });
    return out;
  }

  function snap(b) { return snapV > 0 ? Math.round(b / snapV) * snapV : Math.round(b * 100) / 100; }
  function snapFloor(b) { return snapV > 0 ? Math.floor(b / snapV) * snapV : b; }

  function totalBeats() {
    return Math.max(32, Math.ceil((DAW.engine.songEnd() + 8) / 4) * 4);
  }

  function patternLen(t) {
    if (t.kind === 'drums') return DAW.engine.bars * 4;
    var end = 0;
    (t.notes || []).forEach(function (n) { end = Math.max(end, n.t + n.d); });
    return Math.max(4, Math.ceil(end / 4) * 4);
  }

  function laneColor(i) {
    var cs = App.store.get('fb.colors', null);
    if (Object.prototype.toString.call(cs) !== '[object Array]' || cs.length !== 7) {
      cs = ['#ffab47', '#ffd166', '#8bd450', '#4cc9b0', '#5aa9ff', '#b18cff', '#ff6b9d'];
    }
    return cs[i % 7];
  }

  // ---------------- waveform peaks (cached per track buffer) ----------------

  var peakCache = {};
  function peaks(trackId, n) {
    var key = trackId + ':' + n;
    if (peakCache[key]) return peakCache[key];
    var buf = DAW.samples[trackId];
    if (!buf) return null;
    var d = buf.getChannelData(0);
    var out = new Float32Array(n);
    var per = Math.max(1, Math.floor(d.length / n));
    for (var i = 0; i < n; i++) {
      var mx = 0;
      var base = i * per;
      for (var j = 0; j < per; j += 16) mx = Math.max(mx, Math.abs(d[base + j] || 0));
      out[i] = mx;
    }
    peakCache[key] = out;
    return out;
  }

  function drawWave(canvas, trackId, color) {
    var w = canvas.width, h = canvas.height;
    var p = peaks(trackId, Math.min(220, w));
    if (!p) return;
    var g = canvas.getContext('2d');
    g.clearRect(0, 0, w, h);
    g.fillStyle = color;
    g.globalAlpha = 0.85;
    var step = w / p.length;
    for (var i = 0; i < p.length; i++) {
      var amp = Math.max(1, p[i] * (h - 4));
      g.fillRect(i * step, (h - amp) / 2, Math.max(1, step - 0.5), amp);
    }
  }

  // ---------------- rendering ----------------

  function gridCss() {
    return 'repeating-linear-gradient(90deg, rgba(128,128,128,0.25) 0 1px, transparent 1px ' + (zoomX * 4) + 'px),' +
      'repeating-linear-gradient(90deg, rgba(128,128,128,0.1) 0 1px, transparent 1px ' + zoomX + 'px)';
  }

  function renderAll() {
    renderRuler();
    renderLanes();
    renderTransport();
    positionLoopBar();
  }

  function renderRuler() {
    var tb = totalBeats();
    var h = '';
    for (var b = 0; b < tb; b += 4) {
      h += '<span class="ar-bar" style="left:' + (b * zoomX) + 'px">' + (b / 4 + 1) + '</span>';
    }
    h += '<div class="ar-loopbar" id="ar-loopbar"></div>';
    els.ruler.style.width = (tb * zoomX) + 'px';
    els.ruler.innerHTML = h;
  }

  function positionLoopBar() {
    var lb = document.getElementById('ar-loopbar');
    if (!lb) return;
    var lp = DAW.engine.loopRegion;
    lb.style.display = lp.on ? '' : 'none';
    lb.style.left = (lp.start * zoomX) + 'px';
    lb.style.width = ((lp.end - lp.start) * zoomX) + 'px';
  }

  function renderLanes() {
    var tb = totalBeats();
    var hHeads = '';
    var hLanes = '';
    tracks().forEach(function (t, i) {
      var col = laneColor(i);
      hHeads += '<div class="ar-head" data-arh="' + t.id + '">' +
        '<div class="ar-hname">' + esc(t.name) + '</div>' +
        '<div class="row tight">' +
          (t.kind !== 'drums'
            ? '<button type="button" class="chip fb-chip ar-mini ar-arm' +
              (App.store.get('st.armed', null) === t.id ? ' active' : '') +
              '" data-ararm="' + t.id + '" title="Arm: your keyboard plays this track live and Record captures into it">&#9679;</button>'
            : '') +
          '<button type="button" class="chip fb-chip ar-mini' + (t.mix.mute ? ' active' : '') + '" data-armute="' + t.id + '">M</button>' +
          '<button type="button" class="chip fb-chip ar-mini' + (t.mix.solo ? ' active' : '') + '" data-arsolo="' + t.id + '">S</button>' +
          '<input type="range" data-arvol="' + t.id + '" min="0" max="100" step="5" value="' + t.mix.vol + '" class="ar-vol">' +
          '<canvas class="ar-meter" data-armeter="' + t.id + '" width="36" height="8"></canvas>' +
        '</div></div>';
      var clipsH = '';
      (t.clips || []).forEach(function (c) {
        var isSel = sel.indexOf(c.id) !== -1;
        clipsH += '<div class="ar-clip' + (isSel ? ' ar-sel' : '') + (c.src === 'audio' ? ' ar-audio' : '') +
          '" data-arclip="' + c.id + '" style="left:' + (c.start * zoomX) + 'px;width:' + (c.len * zoomX - 2) +
          'px;--arc:' + col + '">' +
          (c.src === 'audio' ? '<canvas class="ar-wave" width="' + Math.min(220, Math.max(20, Math.floor(c.len * zoomX))) + '" height="40"></canvas>'
            : '<span class="ar-cl">' + esc(t.name) + '</span>') +
          '<span class="ar-rsz" title="Drag to resize"></span>' +
          '</div>';
      });
      hLanes += '<div class="ar-lane" data-arlane="' + t.id + '" style="width:' + (tb * zoomX) + 'px;background-image:' + gridCss() + '">' + clipsH + '</div>';
    });
    els.heads.innerHTML = hHeads;
    els.lanes.innerHTML = hLanes;
    els.lanes.style.width = (tb * zoomX) + 'px';
    // waveforms render once, after the DOM exists
    tracks().forEach(function (t) {
      (t.clips || []).forEach(function (c) {
        if (c.src !== 'audio') return;
        var el = els.lanes.querySelector('[data-arclip="' + c.id + '"] .ar-wave');
        if (el) drawWave(el, t.id, 'rgba(255,255,255,0.75)');
      });
    });
    els.ph.style.height = (tracks().length * LANE_H + RULER_H) + 'px';
  }

  // ---------------- record-to-clip (Studio phase 1) ----------------
  // Arm a melodic track, hit Rec: the song transport rolls and everything
  // you play (MIDI, on-screen piano, QWERTY) is captured with beat-accurate
  // positions, then committed as a pattern clip. If the armed track's note
  // space is already in use by clips, the take lands on a fresh "Take n"
  // track with the same voice — nothing existing is overwritten.

  var recOn = false, recNotes = [], recOpen = {};

  function armedMelodic() {
    var id = App.store.get('st.armed', null);
    var t = trackById(id);
    return t && t.kind !== 'drums' ? t : null;
  }

  function ensureArmed() {
    var t = armedMelodic();
    if (t) return t;
    tracks().forEach(function (x) { if (!t && x.kind !== 'drums') t = x; });
    if (!t) {
      t = { id: 'tr' + Date.now().toString(36), name: 'Take 1', kind: 'synth', voice: 'keys',
        synth: { cutoff: 0, attack: null, release: null, glide: null },
        sampler: { rootNote: 60, loop: false, name: '' },
        steps: null, notes: [], clips: [],
        fx: { type: 'none', mix: 0.3 }, mix: { vol: 80, mute: false, solo: false } };
      DAW.engine.tracks.push(t);
    }
    App.store.set('st.armed', t.id);
    return t;
  }

  function recEvent(d) {
    if (!recOn || !d || !DAW.engine.songPlaying) return;
    var pos = DAW.engine.position();
    if (d.on) {
      recOpen[d.midi] = { m: d.midi, v: Math.max(1, Math.min(127, Math.round(d.vel || 90))), t: pos };
    } else if (recOpen[d.midi]) {
      var n = recOpen[d.midi];
      n.d = Math.max(0.1, pos - n.t);
      recNotes.push(n);
      delete recOpen[d.midi];
    }
  }

  function startRec() {
    ensureArmed();
    recOn = true;
    recNotes = [];
    recOpen = {};
    DAW.engine.freeRun = true; // roll past the song's end while capturing
    if (!DAW.engine.songPlaying) DAW.engine.songPlay();
    renderLanes();
    renderTransport();
  }

  function stopRec() {
    recOn = false;
    DAW.engine.freeRun = false;
    var pos = DAW.engine.songPlaying ? DAW.engine.position() : 0;
    Object.keys(recOpen).forEach(function (k) {
      var n = recOpen[k];
      n.d = Math.max(0.1, pos - n.t);
      recNotes.push(n);
    });
    recOpen = {};
    if (recNotes.length) commitTake();
    renderTransport();
  }

  function commitTake() {
    var src = armedMelodic() || ensureArmed();
    var t0 = 0, t1 = 0;
    recNotes.forEach(function (n, i) {
      t0 = i === 0 ? Math.floor(n.t) : Math.min(t0, Math.floor(n.t));
      t1 = Math.max(t1, n.t + n.d);
    });
    var len = Math.max(1, Math.ceil(t1) - t0);
    var target = src;
    if ((src.clips || []).length || (src.notes || []).length) {
      var takes = tracks().filter(function (x) { return /^Take /.test(x.name); }).length + 1;
      target = { id: 'tr' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5),
        name: 'Take ' + takes, kind: src.kind, voice: src.voice,
        synth: JSON.parse(JSON.stringify(src.synth || {})),
        sampler: JSON.parse(JSON.stringify(src.sampler || {})),
        steps: null, notes: [], clips: [],
        fx: JSON.parse(JSON.stringify(src.fx || { type: 'none', mix: 0.3 })),
        mix: { vol: src.mix.vol, mute: false, solo: false } };
      DAW.engine.tracks.push(target);
    }
    target.notes = recNotes.map(function (n) {
      return { m: n.m, t: +(n.t - t0).toFixed(3), d: +n.d.toFixed(3), v: n.v };
    });
    target.clips = target.clips || [];
    target.clips.push({ id: 'c' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5),
      start: t0, len: len, src: 'pattern' });
    App.store.set('st.tracks', DAW.engine.tracks);
    App.store.set('st.armed', target.id);
    renderLanes();
  }

  function renderTransport() {
    if (!els.play) return;
    els.play.innerHTML = DAW.engine.songPlaying
      ? App.icon('stop', 15) + ' Stop' : App.icon('play', 15) + ' Play song';
    if (els.rec) {
      els.rec.classList.toggle('active', recOn);
      els.rec.innerHTML = recOn ? '&#9632; Stop rec' : '&#9679; Rec';
      els.rec.style.color = recOn ? '#ff5a5a' : '';
    }
    els.loopChip.classList.toggle('active', DAW.engine.loopRegion.on);
    els.followChip.classList.toggle('active', follow);
    els.snapSeg.querySelectorAll('button').forEach(function (b) {
      b.classList.toggle('active', parseFloat(b.getAttribute('data-arsnap')) === snapV);
    });
  }

  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (ch) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch];
    });
  }

  // ---------------- playhead + meters (rAF, transform only) ----------------

  function phTick() {
    var x = DAW.engine.position() * zoomX;
    els.ph.style.transform = 'translateX(' + x + 'px)';
    if (follow && DAW.engine.songPlaying) {
      var sc = els.scroll;
      var vis = sc.clientWidth;
      if (x < sc.scrollLeft + 40 || x > sc.scrollLeft + vis - 80) {
        sc.scrollLeft = Math.max(0, x - 100);
      }
    }
    var pos = DAW.engine.position();
    els.pos.textContent = (Math.floor(pos / 4) + 1) + '.' + (Math.floor(pos % 4) + 1);
    phRaf = requestAnimationFrame(phTick);
  }

  function meterTick() {
    var buf = meterTick.buf || (meterTick.buf = new Uint8Array(128));
    els.heads.querySelectorAll('[data-armeter]').forEach(function (cv) {
      var an = DAW.engine.channelAnalyser(cv.getAttribute('data-armeter'));
      var g = cv.getContext('2d');
      g.clearRect(0, 0, 36, 8);
      if (!an) return;
      an.getByteTimeDomainData(buf);
      var pk = 0;
      for (var i = 0; i < buf.length; i += 4) pk = Math.max(pk, Math.abs(buf[i] - 128) / 128);
      g.fillStyle = pk > 0.85 ? '#d9484a' : '#4cc9b0';
      g.fillRect(0, 0, Math.min(36, pk * 46), 8);
    });
    if (DAW.engine.songPlaying || DAW.engine.playing) meterRaf = requestAnimationFrame(meterTick);
    else meterRaf = 0;
  }

  function startAnims() {
    if (!phRaf) phRaf = requestAnimationFrame(phTick);
    if (!meterRaf) meterRaf = requestAnimationFrame(meterTick);
  }

  function stopAnims() {
    if (phRaf) { cancelAnimationFrame(phRaf); phRaf = 0; }
    if (meterRaf) { cancelAnimationFrame(meterRaf); meterRaf = 0; }
  }

  // ---------------- interactions ----------------

  function beatAt(clientX) {
    var r = els.lanes.getBoundingClientRect();
    return Math.max(0, (clientX - r.left) / zoomX);
  }

  function laneIndexAt(clientY) {
    var r = els.lanes.getBoundingClientRect();
    return Math.floor((clientY - r.top) / LANE_H);
  }

  function wireInteractions() {
    // ruler: tap = seek, drag = loop region
    var rulerDrag = null;
    els.ruler.addEventListener('pointerdown', function (e) {
      e.preventDefault();
      rulerDrag = { start: snapFloor(beatAt(e.clientX)), dragged: false };
      try { els.ruler.setPointerCapture(e.pointerId); } catch (err) { /* synthetic */ }
    });
    els.ruler.addEventListener('pointermove', function (e) {
      if (!rulerDrag) return;
      var b = snap(beatAt(e.clientX));
      if (Math.abs(b - rulerDrag.start) >= Math.max(snapV, 0.25)) {
        rulerDrag.dragged = true;
        DAW.engine.loopRegion = {
          on: true,
          start: Math.min(rulerDrag.start, b),
          end: Math.max(rulerDrag.start, b)
        };
        App.store.set('st.loop', DAW.engine.loopRegion);
        positionLoopBar();
        renderTransport();
      }
    });
    function rulerUp(e) {
      if (!rulerDrag) return;
      if (!rulerDrag.dragged) DAW.engine.setPosition(rulerDrag.start);
      rulerDrag = null;
    }
    els.ruler.addEventListener('pointerup', rulerUp);
    els.ruler.addEventListener('pointercancel', rulerUp);

    // lanes: tap empty = add clip; drag clips = move (multi-select aware);
    // double-tap a clip = open its track's editor (the FL clip -> roll flow)
    var drag = null;
    var lastTap = { id: null, t: 0 };
    els.lanes.addEventListener('pointerdown', function (e) {
      var clipEl = e.target.closest ? e.target.closest('.ar-clip') : null;
      e.preventDefault();
      try { els.lanes.setPointerCapture(e.pointerId); } catch (err) { /* synthetic */ }
      if (clipEl) {
        var id = clipEl.getAttribute('data-arclip');
        if (e.button === 2) { // right-click delete
          deleteClips([id]);
          return;
        }
        var now = performance.now();
        if (lastTap.id === id && now - lastTap.t < 350) {
          lastTap = { id: null, t: 0 };
          var f0 = clipById(id);
          if (f0) {
            App.emit('st:edit', { trackId: f0.track.id });
            App.switchTo('tracks');
          }
          return;
        }
        lastTap = { id: id, t: now };
        if (e.shiftKey) {
          if (sel.indexOf(id) === -1) sel.push(id); else sel = sel.filter(function (x) { return x !== id; });
        } else if (sel.indexOf(id) === -1) {
          sel = [id];
        }
        paintSelection();
        if (e.target.closest && e.target.closest('.ar-rsz')) { // FL-style edge resize
          var fr = clipById(id);
          if (fr) { drag = { resize: id, len0: fr.clip.len, b0: beatAt(e.clientX), moved: false }; return; }
        }
        drag = { ids: sel.slice(), b0: beatAt(e.clientX), l0: laneIndexAt(e.clientY), moved: false, orig: {} };
        drag.ids.forEach(function (cid) {
          var f = clipById(cid);
          if (f) drag.orig[cid] = { start: f.clip.start, trackId: f.track.id };
        });
        return;
      }
      if (e.button === 2) return;
      // empty lane: new clip at the snapped position
      var laneEl = e.target.closest ? e.target.closest('.ar-lane') : null;
      if (!laneEl) return;
      var t = trackById(laneEl.getAttribute('data-arlane'));
      if (!t) return;
      var start = snapFloor(beatAt(e.clientX));
      var isAudio = t.kind === 'sampler' && DAW.samples[t.id];
      var len = isAudio
        ? Math.max(snapV || 0.25, Math.ceil((DAW.samples[t.id].duration / (60 / bpmNow())) * 4) / 4)
        : patternLen(t);
      t.clips = t.clips || [];
      var clip = {
        id: 'c' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5),
        start: start, len: len, src: isAudio ? 'audio' : 'pattern'
      };
      t.clips.push(clip);
      sel = [clip.id];
      save();
      renderAll();
    });
    els.lanes.addEventListener('pointermove', function (e) {
      if (!drag) return;
      if (drag.resize) {
        var f2 = clipById(drag.resize);
        if (!f2) return;
        var nl = drag.len0 + (beatAt(e.clientX) - drag.b0);
        nl = snapV > 0 ? Math.max(snapV, Math.round(nl / snapV) * snapV) : Math.max(0.25, Math.round(nl * 100) / 100);
        if (nl !== f2.clip.len) drag.moved = true;
        f2.clip.len = nl;
        var el2 = els.lanes.querySelector('[data-arclip="' + drag.resize + '"]');
        if (el2) el2.style.width = (nl * zoomX - 2) + 'px';
        return;
      }
      var db = snap(beatAt(e.clientX) - drag.b0 + 1e-9);
      if (snapV === 0) db = beatAt(e.clientX) - drag.b0;
      var dl = laneIndexAt(e.clientY) - drag.l0;
      if (db || dl) drag.moved = true;
      drag.ids.forEach(function (cid) {
        var o = drag.orig[cid];
        var f = clipById(cid);
        if (!o || !f) return;
        f.clip.start = Math.max(0, o.start + db);
        // lane change: single-clip drags only (keeps multi-drag predictable)
        if (drag.ids.length === 1 && dl !== 0) {
          var idx = tracks().indexOf(f.track) + dl;
          idx = Math.max(0, Math.min(tracks().length - 1, idx));
          var target = tracks()[idx];
          if (target && target !== f.track && target.kind === f.track.kind) {
            f.track.clips = f.track.clips.filter(function (c) { return c.id !== cid; });
            target.clips = target.clips || [];
            target.clips.push(f.clip);
          }
        }
        var el = els.lanes.querySelector('[data-arclip="' + cid + '"]');
        if (el) el.style.left = (f.clip.start * zoomX) + 'px';
      });
      if (drag.ids.length === 1 && dl !== 0) renderLanes(); // lane hop: rebuild
    });
    function laneUp() {
      if (!drag) return;
      if (drag.moved) { save(); renderLanes(); }
      drag = null;
    }
    els.lanes.addEventListener('pointerup', laneUp);
    els.lanes.addEventListener('pointercancel', laneUp);
    els.wrap.addEventListener('contextmenu', function (e) { e.preventDefault(); });

    // headers: mute/solo/vol
    els.heads.addEventListener('click', function (e) {
      var a = e.target.closest('[data-ararm]');
      if (a) {
        var aid = a.getAttribute('data-ararm');
        App.store.set('st.armed', App.store.get('st.armed', null) === aid ? null : aid);
        renderLanes();
        return;
      }
      var m = e.target.closest('[data-armute]');
      var s = e.target.closest('[data-arsolo]');
      if (m) {
        var t1 = trackById(m.getAttribute('data-armute'));
        t1.mix.mute = !t1.mix.mute;
      } else if (s) {
        var t2 = trackById(s.getAttribute('data-arsolo'));
        t2.mix.solo = !t2.mix.solo;
      } else return;
      save();
      DAW.engine.applyMix();
      renderLanes();
    });
    els.heads.addEventListener('input', function (e) {
      var v = e.target.closest('[data-arvol]');
      if (!v) return;
      trackById(v.getAttribute('data-arvol')).mix.vol = parseInt(v.value, 10);
      save();
      DAW.engine.applyMix();
    });
  }

  function paintSelection() {
    els.lanes.querySelectorAll('.ar-clip').forEach(function (el) {
      el.classList.toggle('ar-sel', sel.indexOf(el.getAttribute('data-arclip')) !== -1);
    });
  }

  function deleteClips(ids) {
    tracks().forEach(function (t) {
      if (t.clips) t.clips = t.clips.filter(function (c) { return ids.indexOf(c.id) === -1; });
    });
    sel = sel.filter(function (id) { return ids.indexOf(id) === -1; });
    save();
    renderLanes();
  }

  function bpmNow() {
    var v = parseInt(App.store.get('met.bpm', 100), 10);
    return (v >= 30 && v <= 280) ? v : 100;
  }

  // ---------------- page ----------------

  function init(rootEl) {
    App.injectCSS('arrange',
      '.ar-rsz{position:absolute;right:0;top:0;bottom:0;width:10px;cursor:ew-resize;touch-action:none}' +
      '.ar-wrap{display:flex;border:1px solid var(--line);border-radius:12px;overflow:hidden;background:var(--card2)}' +
      '.ar-headcol{flex:0 0 150px;border-right:1px solid var(--line);z-index:2;background:var(--card)}' +
      '.ar-headspacer{height:' + RULER_H + 'px;border-bottom:1px solid var(--line)}' +
      '.ar-head{height:' + LANE_H + 'px;box-sizing:border-box;padding:6px 8px;border-bottom:1px solid var(--line);overflow:hidden}' +
      '.ar-hname{font-size:12px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}' +
      '.ar-mini{padding:2px 7px;font-size:10px}' +
      '.ar-vol{width:40px}' +
      '.ar-meter{border-radius:2px;background:rgba(0,0,0,0.3)}' +
      '.ar-scroll{overflow:auto;flex:1;position:relative;max-height:64vh;overscroll-behavior:contain}' +
      '.ar-ruler{position:sticky;top:0;height:' + RULER_H + 'px;background:var(--card);border-bottom:1px solid var(--line);' +
        'z-index:3;cursor:pointer;touch-action:none;position:sticky}' +
      '.ar-bar{position:absolute;top:4px;font-size:10px;color:var(--muted);padding-left:4px;border-left:1px solid rgba(128,128,128,0.4);height:18px}' +
      '.ar-loopbar{position:absolute;top:0;height:100%;background:var(--accent-glow);border:1px solid var(--accent);border-top:none;border-bottom:none}' +
      '.ar-lane{height:' + LANE_H + 'px;box-sizing:border-box;position:relative;border-bottom:1px solid var(--line);touch-action:none}' +
      '.ar-clip{position:absolute;top:4px;height:' + (LANE_H - 10) + 'px;border-radius:7px;background:var(--card2);background:color-mix(in srgb, var(--arc) 28%, var(--card));' +
        'border:1.5px solid var(--arc);overflow:hidden;cursor:grab;display:flex;align-items:center;padding:0 6px;box-sizing:border-box}' +
      '.ar-clip.ar-sel{box-shadow:0 0 0 2px var(--arc),0 0 14px var(--accent-glow)}' +
      '.ar-cl{font-size:10.5px;font-weight:600;white-space:nowrap;color:var(--text);opacity:0.9}' +
      '.ar-wave{width:100%;height:40px}' +
      '.ar-ph{position:absolute;top:0;left:0;width:2px;background:var(--accent);z-index:2;pointer-events:none;' +
        'box-shadow:0 0 8px var(--accent-glow);will-change:transform}'
    );

    rootEl.innerHTML =
      '<div class="card">' +
        '<div class="row spread">' +
          '<span class="row tight">' +
            '<button type="button" class="btn big primary" id="ar-play"></button>' +
            '<button type="button" class="btn sm" id="ar-rec" title="Record your keyboard playing into a clip on the armed track (arms one for you if needed)">&#9679; Rec</button>' +
            '<button type="button" class="btn sm" id="ar-rtz" title="Back to the top">' + App.icon('restart', 14) + '</button>' +
            '<span class="muted" id="ar-pos" style="min-width:44px;font-variant-numeric:tabular-nums">1.1</span>' +
            '<button type="button" class="chip fb-chip" id="ar-loop" title="Loop the region drawn on the ruler">Loop</button>' +
            '<button type="button" class="chip fb-chip" id="ar-follow" title="Scroll with the playhead">Follow</button>' +
          '</span>' +
          '<span class="row tight">' +
            '<div class="seg" id="ar-snap" title="Snap">' +
              '<button type="button" data-arsnap="4">Bar</button>' +
              '<button type="button" data-arsnap="1">Beat</button>' +
              '<button type="button" data-arsnap="0.25">1/4</button>' +
              '<button type="button" data-arsnap="0">Off</button></div>' +
            '<button type="button" class="btn sm" id="ar-zo">' + App.icon('minus', 13) + '</button>' +
            '<button type="button" class="btn sm" id="ar-zi">' + App.icon('plus', 13) + '</button>' +
            '<button type="button" class="btn sm" id="ar-addsyn" title="Add a synth track">+ Synth</button>' +
            '<button type="button" class="btn sm" id="ar-adddrm" title="Add a drum track (starter beat included)">+ Drums</button>' +
            '<button type="button" class="btn sm" id="ar-addsmp" title="Add a sampler track (drop an audio file on the Editor)">+ Sampler</button>' +
            '<button type="button" class="btn sm" id="ar-export" title="Render the whole arrangement to a WAV file">Export song</button>' +
          '</span>' +
        '</div>' +
        '<div class="ar-wrap" style="margin-top:12px">' +
          '<div class="ar-headcol"><div class="ar-headspacer"></div><div id="ar-heads"></div></div>' +
          '<div class="ar-scroll" id="ar-scroll">' +
            '<div class="ar-ruler" id="ar-ruler"></div>' +
            '<div id="ar-lanes" style="position:relative"></div>' +
            '<div class="ar-ph" id="ar-ph"></div>' +
          '</div>' +
        '</div>' +
        '<div class="muted small" style="margin-top:10px">Tap a lane to place a clip of that track&rsquo;s pattern (sampler lanes with a ' +
          'sample place the AUDIO with its waveform). <b>Double-tap a clip to open its notes/steps in the editor.</b> Drag clips to ' +
          'move them — up/down hops lanes of the same kind. Shift-tap multi-selects; right-click or Delete removes. Tap the ruler ' +
          'to jump the playhead, drag it to draw a loop. Space plays/stops.</div>' +
      '</div>';

    els.wrap = rootEl.querySelector('.ar-wrap');
    els.heads = document.getElementById('ar-heads');
    els.scroll = document.getElementById('ar-scroll');
    els.ruler = document.getElementById('ar-ruler');
    els.lanes = document.getElementById('ar-lanes');
    els.ph = document.getElementById('ar-ph');
    els.play = document.getElementById('ar-play');
    els.rec = document.getElementById('ar-rec');
    els.pos = document.getElementById('ar-pos');
    els.loopChip = document.getElementById('ar-loop');
    els.followChip = document.getElementById('ar-follow');
    els.snapSeg = document.getElementById('ar-snap');

    zoomX = parseInt(App.store.get('st.zoomX', 24), 10) || 24;
    snapV = parseFloat(App.store.get('st.snap', 1));
    if (isNaN(snapV)) snapV = 1;
    follow = App.store.get('st.follow', true) !== false;
    var lp = App.store.get('st.loop', null);
    if (lp) DAW.engine.loopRegion = lp;

    els.play.addEventListener('click', function () {
      if (DAW.engine.songPlaying) DAW.engine.songStop(); else DAW.engine.songPlay();
    });
    els.rec.addEventListener('click', function () { if (recOn) stopRec(); else startRec(); });
    function addTrack(kind) {
      var names = { drums: 'Drums', synth: 'Synth', sampler: 'Sampler' };
      var count = tracks().filter(function (t) { return t.kind === kind; }).length;
      var t = { id: 'tr' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5),
        name: names[kind] + (count ? ' ' + (count + 1) : ''), kind: kind, voice: 'keys',
        synth: { cutoff: 0, attack: null, release: null, glide: null },
        sampler: { rootNote: 60, loop: false, name: '' },
        steps: null, notes: kind === 'drums' ? null : [], clips: [],
        fx: { type: 'none', mix: 0.3 }, mix: { vol: 80, mute: false, solo: false } };
      if (kind === 'drums') {
        var st = [];
        for (var l = 0; l < 8; l++) { var r = []; for (var i = 0; i < 64; i++) r.push(0); st.push(r); }
        st[0][0] = st[0][8] = st[0][16] = st[0][24] = 1;
        st[1][8] = st[1][24] = 1;
        for (var h2 = 0; h2 < 32; h2 += 4) st[3][h2] = 1;
        t.steps = st;
      }
      DAW.engine.tracks.push(t);
      save();
      renderLanes();
    }
    document.getElementById('ar-addsyn').addEventListener('click', function () { addTrack('synth'); });
    document.getElementById('ar-adddrm').addEventListener('click', function () { addTrack('drums'); });
    document.getElementById('ar-addsmp').addEventListener('click', function () { addTrack('sampler'); });
    App.on('midi:note', recEvent);
    App.on('note:input', recEvent);
    document.getElementById('ar-rtz').addEventListener('click', function () {
      DAW.engine.setPosition(DAW.engine.loopRegion.on ? DAW.engine.loopRegion.start : 0);
    });
    els.loopChip.addEventListener('click', function () {
      var l = DAW.engine.loopRegion;
      DAW.engine.loopRegion = { on: !l.on, start: l.start, end: l.end };
      App.store.set('st.loop', DAW.engine.loopRegion);
      positionLoopBar();
      renderTransport();
    });
    els.followChip.addEventListener('click', function () {
      follow = !follow;
      App.store.set('st.follow', follow);
      renderTransport();
    });
    els.snapSeg.addEventListener('click', function (e) {
      var b = e.target.closest('[data-arsnap]');
      if (!b) return;
      snapV = parseFloat(b.getAttribute('data-arsnap'));
      App.store.set('st.snap', snapV);
      renderTransport();
    });
    document.getElementById('ar-zi').addEventListener('click', function () {
      zoomX = Math.min(80, Math.round(zoomX * 1.4));
      App.store.set('st.zoomX', zoomX);
      renderAll();
    });
    document.getElementById('ar-zo').addEventListener('click', function () {
      zoomX = Math.max(8, Math.round(zoomX / 1.4));
      App.store.set('st.zoomX', zoomX);
      renderAll();
    });
    document.getElementById('ar-export').addEventListener('click', function () {
      var btn = this;
      btn.disabled = true;
      btn.textContent = 'Rendering…';
      DAW.engine.renderSong().then(function (blob) {
        DAW.downloadBlob(blob, (App.store.get('song.name', 'soundLAB') || 'soundLAB').replace(/[^\w\- ]+/g, '') + '-song.wav');
        btn.disabled = false;
        btn.textContent = 'Export song';
      }).catch(function () {
        btn.disabled = false;
        btn.textContent = 'Export song';
      });
    });

    wireInteractions();
    App.on('st:tr', function () {
      if (recOn && !DAW.engine.songPlaying) stopRec(); // transport stopped -> take commits
      renderTransport();
      startAnims();
    });
    App.on('st:state', function () { startAnims(); });
    renderAll();
  }

  App.register('arrange', {
    init: init,
    onShow: function () {
      sel = [];
      renderAll();
      startAnims();
    },
    onHide: function () {
      stopAnims();
    },
    onKey: function (e) {
      if (e.code === 'Space') {
        e.preventDefault();
        if (DAW.engine.songPlaying) DAW.engine.songStop(); else DAW.engine.songPlay();
      } else if ((e.code === 'Delete' || e.code === 'Backspace') && sel.length) {
        e.preventDefault();
        deleteClips(sel.slice());
      }
    }
  });
})();
