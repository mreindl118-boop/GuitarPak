/* soundLAB studio — the DAW side of the app, phase one.
 * Registers the 'song' (sketchbook home) and 'ideas' (capture inbox) pages
 * and runs the app-wide CAPTURE service behind the ● button in the header.
 *
 * Capture philosophy: there is always a current song, and anything you play —
 * ROLI/MIDI anywhere in the app, QWERTY or touch keys on the Piano page — can
 * become an idea in it. Two ways in:
 *   - press ● (in the context bar, any page, any workspace), play, press again
 *   - "Keep the last 30s" on the Ideas page: a rolling buffer of everything
 *     you played recently, for the takes that happen before you think to record
 * Ideas are stored as note lists (midi/vel/start/dur) tagged with the key,
 * tempo and date they were played in. Playback uses the studio synth
 * (js/daw/synth.js — MPE-capable, ported from OpenStudio).
 * Store: song.name, ideas.list (guitarlab.* prefix as everywhere).
 */
(function () {
  'use strict';

  var MAX_IDEAS = 100;
  var MAX_NOTES = 2000;

  function retroSecs() {
    var v = parseInt(App.store.get('sd.retroSecs', 30), 10);
    return [15, 30, 60].indexOf(v) !== -1 ? v : 30;
  }

  var els = {};       // ideas page
  var sels = {};      // song page

  // ---------------- capture service ----------------

  var rec = null;          // {t0, open: {key: {m,v,t}}, notes: []}
  var retro = [];          // completed notes, absolute clock, pruned to RETRO_SECS
  var retroOpen = {};      // note-on awaiting off: src+chan+midi -> {m,v,t}

  function nowS() { return performance.now() / 1000; }

  function noteKey(src, midi) { return src + ':' + midi; }

  function inputEvent(d, src) {
    if (!d || typeof d.midi !== 'number') return;
    var t = nowS();
    var k = noteKey(src, d.midi);
    if (d.on) {
      var open = { m: d.midi, v: d.vel || 90, t: t };
      retroOpen[k] = open;
      if (rec) rec.open[k] = { m: d.midi, v: d.vel || 90, t: t };
      if (d.dur) { // tap notes carry their own duration — close immediately
        closeNote(k, t + d.dur);
      }
      paintRec();
    } else {
      closeNote(k, t);
    }
  }

  function closeNote(k, t) {
    var o = retroOpen[k];
    if (o) {
      delete retroOpen[k];
      retro.push({ m: o.m, v: o.v, t: o.t, d: Math.max(0.05, t - o.t) });
      var cut = nowS() - retroSecs();
      while (retro.length && retro[0].t + retro[0].d < cut) retro.shift();
      if (retro.length > MAX_NOTES) retro.shift();
    }
    if (rec && rec.open[k]) {
      var ro = rec.open[k];
      delete rec.open[k];
      rec.notes.push({ m: ro.m, v: ro.v, t: ro.t, d: Math.max(0.05, t - ro.t) });
      if (rec.notes.length > MAX_NOTES) rec.notes.shift();
    }
  }

  function ideaTags() {
    return {
      bpm: Math.round(parseFloat(App.store.get('met.bpm', 100)) || 100),
      root: App.store.get('fb.root', 9),
      scale: App.store.get('fb.scale', 'major')
    };
  }

  function finalize(notes, source) {
    if (!notes.length) return null;
    var t0 = notes[0].t;
    notes.forEach(function (n) { if (n.t < t0) t0 = n.t; });
    var out = notes.map(function (n) {
      return { m: n.m, v: n.v, t: Math.round((n.t - t0) * 1000) / 1000, d: Math.round(n.d * 1000) / 1000 };
    }).sort(function (a, b) { return a.t - b.t; });
    var end = 0;
    out.forEach(function (n) { end = Math.max(end, n.t + n.d); });
    var tags = ideaTags();
    var list = ideas();
    return {
      id: 'i' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      name: 'Idea ' + (list.length + 1),
      ts: Date.now(),
      source: source,
      bpm: tags.bpm, root: tags.root, scale: tags.scale,
      dur: Math.round(end * 10) / 10,
      notes: out
    };
  }

  function ideas() {
    var v = App.store.get('ideas.list', []);
    return Object.prototype.toString.call(v) === '[object Array]' ? v : [];
  }

  function saveIdeas(list) {
    App.store.set('ideas.list', list.slice(-MAX_IDEAS));
  }

  function addIdea(idea) {
    if (!idea) return false;
    var list = ideas();
    list.push(idea);
    saveIdeas(list);
    renderIdeas();
    renderSong();
    return true;
  }

  function startRec() {
    rec = { t0: nowS(), open: {}, notes: [] };
    paintRec();
  }

  function stopRec() {
    if (!rec) return;
    var t = nowS();
    Object.keys(rec.open).forEach(function (k) {
      var o = rec.open[k];
      rec.notes.push({ m: o.m, v: o.v, t: o.t, d: Math.max(0.05, t - o.t) });
    });
    var idea = finalize(rec.notes, 'rec');
    rec = null;
    paintRec();
    if (idea) {
      addIdea(idea);
      flashRec('saved “' + idea.name + '” · ' + idea.notes.length + ' notes');
    } else {
      flashRec('nothing played — no idea saved');
    }
  }

  function keepRetro() {
    var t = nowS();
    var notes = retro.slice();
    Object.keys(retroOpen).forEach(function (k) {
      var o = retroOpen[k];
      notes.push({ m: o.m, v: o.v, t: o.t, d: Math.max(0.05, t - o.t) });
    });
    var idea = finalize(notes, 'retro');
    if (idea) {
      addIdea(idea);
      flashRec('kept “' + idea.name + '” · ' + idea.notes.length + ' notes');
    }
    return idea;
  }

  function paintRec() {
    var b = document.getElementById('cx-rec');
    if (!b) return;
    b.classList.toggle('cx-rec-on', !!rec);
    b.title = rec
      ? 'Recording into the current song — tap to stop and keep it'
      : 'Capture: tap, play anything (ROLI, typing keys, touch), tap again — it lands in Ideas';
  }

  var flashT = null;
  function flashRec(msg) {
    var el = document.getElementById('cx-rec-msg');
    if (!el) return;
    el.textContent = msg;
    el.style.display = '';
    if (flashT) clearTimeout(flashT);
    flashT = setTimeout(function () { el.style.display = 'none'; }, 2600);
  }

  // ---------------- idea playback ----------------

  var playSynth = null;
  var playVoiceId = null;
  var playingId = null;
  var playTimers = [];

  function stopPlayback() {
    playTimers.forEach(clearTimeout);
    playTimers = [];
    if (playSynth) playSynth.allNotesOff();
    playingId = null;
    renderIdeasTransport();
  }

  function voicePreset() {
    var id = App.store.get('sd.playVoice', 'keys');
    for (var i = 0; i < DAW.SYNTH_PRESETS.length; i++) {
      if (DAW.SYNTH_PRESETS[i].id === id) return DAW.SYNTH_PRESETS[i];
    }
    return DAW.SYNTH_PRESETS[2]; // soft keys
  }

  function playIdea(idea) {
    var ctx;
    try { ctx = App.getAudio(); } catch (e) { return; }
    stopPlayback();
    var preset = voicePreset();
    if (playSynth && playVoiceId !== preset.id) {
      playSynth.dispose();
      playSynth = null;
    }
    if (!playSynth) {
      playSynth = DAW.createSynth(ctx, preset.params);
      playSynth.output.connect(ctx.destination);
      playVoiceId = preset.id;
    }
    playingId = idea.id;
    var t0 = ctx.currentTime + 0.06;
    idea.notes.forEach(function (n) {
      playSynth.noteOn(n.m, (n.v / 127) * 0.8, t0 + n.t, 0);
      playSynth.noteOff(n.m, t0 + n.t + n.d, 0);
    });
    playTimers.push(setTimeout(function () {
      playingId = null;
      renderIdeasTransport();
    }, (idea.dur + 0.8) * 1000));
    renderIdeasTransport();
  }

  // ---------------- ideas page ----------------

  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (ch) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch];
    });
  }

  function keyName(root, scale) {
    var pc = (typeof root === 'number' && root >= 0 && root < 12) ? root : 9;
    var sc = Theory.SCALES[scale] ? scale : 'major';
    return Theory.pcName(pc, Theory.FLAT_KEYS.has(pc)) + ' ' +
      Theory.SCALES[sc].name.replace(/\s*\(.*\)$/, '');
  }

  function fmtWhen(ts) {
    var d = new Date(ts);
    return (d.getMonth() + 1) + '/' + d.getDate() + ' ' +
      d.getHours() + ':' + ('0' + d.getMinutes()).slice(-2);
  }

  function renderIdeas() {
    if (!els.list) return;
    var list = ideas();
    if (!list.length) {
      els.list.innerHTML = '<div class="muted" style="padding:18px 4px">No ideas yet. ' +
        'Tap the <b>●</b> up top and play — ROLI anywhere, typing keys or touch on the Piano page — ' +
        'then tap it again. Or play first and hit “Keep the last 30s”.</div>';
      return;
    }
    var h = '';
    for (var i = list.length - 1; i >= 0; i--) {
      var it = list[i];
      h += '<div class="card sd-idea" data-idea="' + it.id + '">' +
        '<div class="row spread">' +
          '<span class="row tight">' +
            '<button type="button" class="btn sm" data-iplay="' + it.id + '">' +
              App.icon(playingId === it.id ? 'stop' : 'play', 14) + '</button>' +
            '<input class="sd-name" data-iname="' + it.id + '" value="' + esc(it.name) + '" aria-label="Idea name">' +
          '</span>' +
          '<span class="row tight">' +
            '<button type="button" class="btn sm" data-itrk="' + it.id + '" title="Turn this idea into a synth track in the loop">To track</button>' +
            '<button type="button" class="btn sm" data-ikey="' + it.id + '" title="Set the app key/scale to this idea’s">Use key</button>' +
            '<button type="button" class="btn sm" data-idel="' + it.id + '" aria-label="Delete idea">' + App.icon('close', 13) + '</button>' +
          '</span>' +
        '</div>' +
        '<div class="muted small" style="margin-top:6px">' +
          esc(keyName(it.root, it.scale)) + ' · ' + it.bpm + ' BPM · ' +
          it.notes.length + ' notes · ' + it.dur + 's · ' + fmtWhen(it.ts) +
          (it.source === 'retro' ? ' · retro-captured' : '') +
        '</div></div>';
    }
    els.list.innerHTML = h;
  }

  function renderIdeasTransport() {
    if (!els.list) return;
    els.list.querySelectorAll('[data-iplay]').forEach(function (b) {
      b.innerHTML = App.icon(playingId === b.getAttribute('data-iplay') ? 'stop' : 'play', 14);
    });
  }

  function ideaById(id) {
    var list = ideas();
    for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
    return null;
  }

  function initIdeas(rootEl) {
    rootEl.innerHTML =
      '<div class="card">' +
        '<div class="row spread">' +
          '<h2 style="margin:0">Ideas</h2>' +
          '<button type="button" class="btn" id="sd-retro">' + App.icon('restart', 15) +
            ' <span id="sd-retro-label">Keep the last ' + retroSecs() + 's</span></button>' +
        '</div>' +
        '<div class="muted small" style="margin-top:8px">Everything you play is remembered (length in Settings) — ' +
          'grab it even if you never hit record. Each idea is tagged with the key and tempo it was played in.</div>' +
      '</div>' +
      '<div id="sd-list"></div>';
    els.list = document.getElementById('sd-list');

    document.getElementById('sd-retro').addEventListener('click', function () {
      var idea = keepRetro();
      if (!idea) flashRec('nothing in the last 30s');
    });

    els.list.addEventListener('click', function (e) {
      var b = e.target.closest('[data-iplay],[data-idel],[data-ikey],[data-itrk]');
      if (!b) return;
      var idea;
      if (b.hasAttribute('data-itrk')) {
        idea = ideaById(b.getAttribute('data-itrk'));
        if (idea) ideaToTrack(idea);
      } else if (b.hasAttribute('data-iplay')) {
        idea = ideaById(b.getAttribute('data-iplay'));
        if (!idea) return;
        if (playingId === idea.id) stopPlayback(); else playIdea(idea);
      } else if (b.hasAttribute('data-ikey')) {
        idea = ideaById(b.getAttribute('data-ikey'));
        if (!idea) return;
        App.store.set('fb.root', idea.root);
        App.store.set('fb.scale', idea.scale);
        App.emit('fb:set', { source: 'studio', root: idea.root, scale: idea.scale });
        flashRec('key set to ' + keyName(idea.root, idea.scale));
      } else {
        var id = b.getAttribute('data-idel');
        saveIdeas(ideas().filter(function (it) { return it.id !== id; }));
        if (playingId === id) stopPlayback();
        renderIdeas();
        renderSong();
      }
    });
    els.list.addEventListener('change', function (e) {
      var inp = e.target.closest('[data-iname]');
      if (!inp) return;
      var id = inp.getAttribute('data-iname');
      var list = ideas();
      list.forEach(function (it) { if (it.id === id) it.name = inp.value.slice(0, 60) || it.name; });
      saveIdeas(list);
    });

    renderIdeas();
  }

  // ---------------- tracks: the loop workstation ----------------
  // Groovebox-style session loop: every track holds a step pattern (drums)
  // or a note clip (synth/sampler), all looping in sync at the shared tempo.
  // Arm a track and your ROLI/QWERTY plays ITS instrument live, with MPE.

  var tels = {};
  var trk = { sel: null, noteLen: 1 };

  function tracksList() { return DAW.engine.tracks; }

  function loadTracks() {
    var t = App.store.get('st.tracks', []);
    if (Object.prototype.toString.call(t) !== '[object Array]') t = [];
    t = t.filter(function (x) { return x && x.id && ['drums', 'synth', 'sampler'].indexOf(x.kind) !== -1; });
    t.forEach(function (x) {
      x.mix = x.mix || { vol: 80, mute: false, solo: false };
      x.fx = x.fx || { type: 'none', mix: 0.3 };
      if (x.kind === 'drums' && !x.steps) x.steps = emptySteps();
      if (x.kind !== 'drums' && !x.notes) x.notes = [];
    });
    DAW.engine.tracks = t;
    var b = parseInt(App.store.get('st.bars', 2), 10);
    DAW.engine.bars = ([1, 2, 4].indexOf(b) !== -1) ? b : 2;
  }

  function saveTracks() {
    App.store.set('st.tracks', tracksList());
    App.store.set('st.bars', DAW.engine.bars);
  }

  function emptySteps() {
    var s = [];
    for (var l = 0; l < 5; l++) {
      var row = [];
      for (var i = 0; i < 64; i++) row.push(0);
      s.push(row);
    }
    return s;
  }

  function trackById(id) {
    var out = null;
    tracksList().forEach(function (t) { if (t.id === id) out = t; });
    return out;
  }

  function newTrack(kind) {
    var names = { drums: 'Drums', synth: 'Synth', sampler: 'Sampler' };
    var n = tracksList().filter(function (t) { return t.kind === kind; }).length;
    var t = {
      id: 't' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      name: names[kind] + (n ? ' ' + (n + 1) : ''),
      kind: kind,
      voice: 'keys',
      synth: { cutoff: 0, attack: null, release: null, glide: null },
      sampler: { rootNote: 60, loop: false, name: '' },
      steps: kind === 'drums' ? emptySteps() : null,
      notes: kind === 'drums' ? null : [],
      fx: { type: 'none', mix: 0.3 },
      mix: { vol: 80, mute: false, solo: false }
    };
    if (kind === 'drums') { // a starter beat so Play makes sound immediately
      t.steps[0][0] = t.steps[0][8] = t.steps[0][16] = t.steps[0][24] = 1;
      t.steps[1][8] = t.steps[1][24] = 1;
      for (var h = 0; h < 32; h += 4) t.steps[3][h] = 1;
    }
    tracksList().push(t);
    trk.sel = t.id;
    saveTracks();
    renderTracks();
    renderEditor2();
    return t;
  }

  // ---- sampler bytes live in IndexedDB (too big for localStorage) ----

  function idb() {
    return new Promise(function (res, rej) {
      var rq = indexedDB.open('guitarlab-daw', 1);
      rq.onupgradeneeded = function () { rq.result.createObjectStore('samples'); };
      rq.onsuccess = function () { res(rq.result); };
      rq.onerror = function () { rej(rq.error); };
    });
  }

  function idbPut(key, val) {
    return idb().then(function (db) {
      return new Promise(function (res, rej) {
        var tx = db.transaction('samples', 'readwrite');
        tx.objectStore('samples').put(val, key);
        tx.oncomplete = res;
        tx.onerror = function () { rej(tx.error); };
      });
    });
  }

  function idbGet(key) {
    return idb().then(function (db) {
      return new Promise(function (res, rej) {
        var rq = db.transaction('samples').objectStore('samples').get(key);
        rq.onsuccess = function () { res(rq.result); };
        rq.onerror = function () { rej(rq.error); };
      });
    });
  }

  function idbDel(key) {
    return idb().then(function (db) {
      db.transaction('samples', 'readwrite').objectStore('samples').delete(key);
    });
  }

  function loadSampleBuffers() {
    tracksList().forEach(function (t) {
      if (t.kind !== 'sampler' || DAW.samples[t.id]) return;
      idbGet(t.id).then(function (bytes) {
        if (!bytes) return;
        var ctx = App.getAudio();
        ctx.decodeAudioData(bytes.slice(0), function (buf) {
          DAW.samples[t.id] = buf;
          if (trk.sel === t.id) renderEditor2();
        }, function () { /* undecodable */ });
      }).catch(function () { /* idb unavailable */ });
    });
  }

  // ---- rendering ----

  function noteColors() {
    var c = App.store.get('fb.colors', null);
    if (Object.prototype.toString.call(c) === '[object Array]' && c.length === 7) return c;
    return ['#ffab47', '#ffd166', '#8bd450', '#4cc9b0', '#5aa9ff', '#b18cff', '#ff6b9d'];
  }

  function renderTransport() {
    if (!tels.play) return;
    tels.play.innerHTML = DAW.engine.playing
      ? App.icon('stop', 15) + ' Stop' : App.icon('play', 15) + ' Play';
    tels.bars.value = String(DAW.engine.bars);
  }

  function renderTracks() {
    if (!tels.list) return;
    var armed = App.store.get('st.armed', null);
    var h = '';
    tracksList().forEach(function (t) {
      var voiceLabel = t.kind === 'drums' ? '808 kit'
        : t.kind === 'sampler' ? (t.sampler.name || 'no sample')
        : ({ saw: 'Super saw', pad: 'Warm pad', keys: 'Soft keys', bass: 'Round bass' }[t.voice] || t.voice);
      h += '<div class="st-row' + (t.id === trk.sel ? ' st-sel' : '') + '" data-st="' + t.id + '">' +
        '<button type="button" class="chip fb-chip st-arm' + (armed === t.id ? ' active' : '') + '" data-starm="' + t.id + '" ' +
          'title="Arm: your MIDI/typing keys play this track&rsquo;s instrument">Live</button>' +
        '<input class="sd-name" data-stname="' + t.id + '" value="' + esc(t.name) + '" aria-label="Track name">' +
        '<span class="muted small st-kind">' + t.kind + ' · ' + esc(voiceLabel) + '</span>' +
        '<button type="button" class="chip fb-chip' + (t.mix.mute ? ' active' : '') + '" data-stmute="' + t.id + '">M</button>' +
        '<button type="button" class="chip fb-chip' + (t.mix.solo ? ' active' : '') + '" data-stsolo="' + t.id + '">S</button>' +
        '<input type="range" data-stvol="' + t.id + '" min="0" max="100" step="5" value="' + t.mix.vol + '">' +
        '<button type="button" class="btn sm" data-stedit="' + t.id + '">Edit</button>' +
        '<button type="button" class="btn sm" data-stdel="' + t.id + '" aria-label="Delete track">' + App.icon('close', 12) + '</button>' +
        '</div>';
    });
    if (!h) {
      h = '<div class="muted" style="padding:14px 4px">No tracks yet — add Drums for an instant beat, ' +
        'a Synth to play from your keys, or a Sampler and load any sound into it.</div>';
    }
    tels.list.innerHTML = h;
  }

  function stepCols() { return DAW.engine.bars * 16; }

  function renderEditor2() {
    if (!tels.editor) return;
    var t = trackById(trk.sel);
    if (!t) { tels.editor.innerHTML = ''; return; }
    var h = '<div class="row spread" style="margin-bottom:10px"><h3 style="margin:0">' + esc(t.name) + '</h3>' +
      '<span class="row tight">' +
      '<label class="row tight small muted" style="gap:5px">FX <select id="st-fx">' +
        ['none', 'reverb', 'delay', 'drive'].concat(Object.keys(DAW.fxPlugins || {})).map(function (f) {
          var label = (DAW.fxPlugins && DAW.fxPlugins[f] && DAW.fxPlugins[f].name) || f;
          return '<option value="' + f + '"' + (t.fx.type === f ? ' selected' : '') + '>' + esc(label) + '</option>';
        }).join('') + '</select></label>' +
      '<input type="range" id="st-fxmix" min="0" max="100" step="5" value="' + Math.round(t.fx.mix * 100) + '" style="width:90px" title="FX amount">' +
      '</span></div>';

    if (t.kind === 'drums') {
      h += '<div class="st-grid" id="st-steps" style="grid-template-columns:64px repeat(' + stepCols() + ', 22px)">';
      for (var lane = 0; lane < 5; lane++) {
        h += '<span class="st-lane">' + DAW.DRUM_LANES[lane] + '</span>';
        for (var s = 0; s < stepCols(); s++) {
          h += '<button type="button" class="st-cell' + (t.steps[lane][s] ? ' on' : '') +
            (s % 4 === 0 ? ' st-beat' : '') + '" data-lane="' + lane + '" data-step="' + s + '"></button>';
        }
      }
      h += '</div>';
    } else {
      if (t.kind === 'synth') {
        h += '<div class="row" style="margin-bottom:10px">' +
          '<div class="fb-field">Voice<div class="seg" id="st-voice">' +
            DAW.SYNTH_PRESETS.map(function (p) {
              return '<button type="button" data-stv="' + p.id + '"' + (t.voice === p.id ? ' class="active"' : '') + '>' + p.name.split(' ')[1] + '</button>';
            }).join('') + '</div></div>' +
          '<label class="field">Cutoff<input type="range" id="st-cutoff" min="200" max="8000" step="100" value="' + (t.synth.cutoff || 3200) + '" style="width:110px"></label>' +
          '<label class="field">Attack<input type="range" id="st-attack" min="0" max="100" step="2" value="' + Math.round((t.synth.attack != null ? t.synth.attack : 0.01) * 100) + '" style="width:90px"></label>' +
          '<label class="field">Release<input type="range" id="st-release" min="2" max="200" step="2" value="' + Math.round((t.synth.release != null ? t.synth.release : 0.3) * 100) + '" style="width:90px"></label>' +
          '<label class="field">Glide<input type="range" id="st-glide" min="0" max="30" step="1" value="' + Math.round((t.synth.glide || 0) * 100) + '" style="width:80px"></label>' +
          '</div>';
      } else {
        var buf = DAW.samples[t.id];
        h += '<div class="row" style="margin-bottom:10px">' +
          '<label class="btn sm">' + App.icon('plus', 13) + ' Load sample<input type="file" id="st-file" accept="audio/*" style="display:none"></label>' +
          '<span class="muted small" id="st-sinfo">' + (buf
            ? esc(t.sampler.name || 'sample') + ' · ' + (Math.round(buf.duration * 10) / 10) + 's'
            : 'no sample loaded — pick any audio file') + '</span>' +
          '<label class="field">Root note<select id="st-root">' + (function () {
            var o = '';
            for (var m = 36; m <= 84; m++) {
              o += '<option value="' + m + '"' + (t.sampler.rootNote === m ? ' selected' : '') + '>' +
                Theory.midiName(m) + '</option>';
            }
            return o;
          })() + '</select></label>' +
          '<label class="row tight small muted" style="gap:5px"><input type="checkbox" id="st-loop"' + (t.sampler.loop ? ' checked' : '') + '>Loop sustain</label>' +
          '</div>';
      }
      // piano roll
      h += '<div class="row tight" style="margin-bottom:8px">' +
        '<span class="muted small">Note length</span>' +
        '<div class="seg" id="st-nlen">' +
          [1, 2, 4].map(function (l) {
            return '<button type="button" data-stnl="' + l + '"' + (trk.noteLen === l ? ' class="active"' : '') + '>' +
              (l === 1 ? '1/16' : l === 2 ? '1/8' : '1/4') + '</button>';
          }).join('') + '</div>' +
        '<button type="button" class="btn sm" id="st-clear">Clear notes</button>' +
        '<span class="muted small">Tap to add · tap a note to remove · colors = scale degrees in your key</span>' +
        '</div>' +
        '<div class="st-rollwrap"><svg id="st-roll" width="' + (46 + stepCols() * 22) + '" height="364"></svg></div>';
    }
    tels.editor.innerHTML = h;
    if (t.kind !== 'drums') drawRoll(t);
    wireEditor(t);
  }

  var ROLL_LO = 48, ROLL_HI = 73; // C3..C#5
  function drawRoll(t) {
    var svg = document.getElementById('st-roll');
    if (!svg) return;
    var cols = stepCols();
    var colW = 22, rowH = 14, x0 = 46;
    var cs = noteColors();
    var keyPc = (function () { var v = App.store.get('fb.root', 9); return (typeof v === 'number') ? v : 9; })();
    var scale = (function () { var v = App.store.get('fb.scale', 'major'); return Theory.SCALES[v] ? v : 'major'; })();
    var steps = Theory.SCALES[scale].steps;
    var h = '';
    for (var m = ROLL_HI; m >= ROLL_LO; m--) {
      var y = (ROLL_HI - m) * rowH;
      var pc = Theory.mod12(m - keyPc);
      var degIdx = steps.indexOf(pc);
      var inScale = degIdx !== -1;
      h += '<rect x="' + x0 + '" y="' + y + '" width="' + (cols * colW) + '" height="' + rowH + '" fill="' +
        (inScale ? 'rgba(255,255,255,0.045)' : 'transparent') + '"/>' +
        '<text x="' + (x0 - 6) + '" y="' + (y + 10.5) + '" text-anchor="end" font-size="9" fill="' +
        (inScale ? (degIdx === 0 ? cs[0] : 'var(--muted)') : 'rgba(128,128,128,0.4)') + '">' + Theory.midiName(m) + '</text>';
    }
    for (var c = 0; c <= cols; c++) {
      h += '<line x1="' + (x0 + c * colW) + '" y1="0" x2="' + (x0 + c * colW) + '" y2="' + ((ROLL_HI - ROLL_LO + 1) * rowH) + '" stroke="rgba(128,128,128,' +
        (c % 16 === 0 ? '0.5' : c % 4 === 0 ? '0.25' : '0.1') + ')" stroke-width="1"/>';
    }
    (t.notes || []).forEach(function (n, i) {
      if (n.m < ROLL_LO || n.m > ROLL_HI) return;
      var y = (ROLL_HI - n.m) * rowH;
      var pc = Theory.mod12(n.m - keyPc);
      var degIdx = steps.indexOf(pc);
      var fill = degIdx !== -1 ? cs[degIdx % 7] : '#8a8a92';
      h += '<rect class="st-note" data-ni="' + i + '" x="' + (x0 + n.t * 4 * colW + 1) + '" y="' + (y + 1.5) +
        '" width="' + Math.max(8, n.d * 4 * colW - 2) + '" height="' + (rowH - 3) + '" rx="3" fill="' + fill + '"/>';
    });
    h += '<rect id="st-ph" x="' + x0 + '" y="0" width="' + colW + '" height="' + ((ROLL_HI - ROLL_LO + 1) * rowH) + '" fill="rgba(255,255,255,0.07)" style="display:none"/>';
    svg.innerHTML = h;
  }

  function wireEditor(t) {
    var fx = document.getElementById('st-fx');
    var fxmix = document.getElementById('st-fxmix');
    fx.addEventListener('change', function () {
      t.fx.type = this.value;
      saveTracks();
      DAW.engine.rebuildChannel(t.id);
    });
    fxmix.addEventListener('change', function () {
      t.fx.mix = parseInt(this.value, 10) / 100;
      saveTracks();
      DAW.engine.rebuildChannel(t.id);
    });

    if (t.kind === 'drums') {
      document.getElementById('st-steps').addEventListener('click', function (e) {
        var b = e.target.closest('.st-cell');
        if (!b) return;
        var lane = parseInt(b.getAttribute('data-lane'), 10);
        var s = parseInt(b.getAttribute('data-step'), 10);
        t.steps[lane][s] = t.steps[lane][s] ? 0 : 1;
        b.classList.toggle('on', !!t.steps[lane][s]);
        saveTracks();
      });
      return;
    }

    if (t.kind === 'synth') {
      document.getElementById('st-voice').addEventListener('click', function (e) {
        var b = e.target.closest('[data-stv]');
        if (!b) return;
        t.voice = b.getAttribute('data-stv');
        saveTracks();
        DAW.engine.rebuildChannel(t.id);
        renderTracks();
        renderEditor2();
      });
      [['st-cutoff', 'cutoff', 1], ['st-attack', 'attack', 100], ['st-release', 'release', 100], ['st-glide', 'glide', 100]].forEach(function (cfg) {
        document.getElementById(cfg[0]).addEventListener('change', function () {
          t.synth[cfg[1]] = parseInt(this.value, 10) / cfg[2];
          saveTracks();
          DAW.engine.rebuildChannel(t.id);
        });
      });
    } else {
      document.getElementById('st-file').addEventListener('change', function () {
        var f = this.files && this.files[0];
        if (!f) return;
        var rd = new FileReader();
        rd.onload = function () {
          var bytes = rd.result;
          idbPut(t.id, bytes.slice(0)).catch(function () { /* idb unavailable — session-only */ });
          App.getAudio().decodeAudioData(bytes, function (buf) {
            DAW.samples[t.id] = buf;
            t.sampler.name = f.name.replace(/\.[^.]+$/, '').slice(0, 24);
            saveTracks();
            DAW.engine.rebuildChannel(t.id);
            renderTracks();
            renderEditor2();
          }, function () {
            var el = document.getElementById('st-sinfo');
            if (el) el.textContent = 'could not decode that file — try a WAV/MP3/OGG';
          });
        };
        rd.readAsArrayBuffer(f);
      });
      document.getElementById('st-root').addEventListener('change', function () {
        t.sampler.rootNote = parseInt(this.value, 10);
        saveTracks();
        DAW.engine.rebuildChannel(t.id);
      });
      document.getElementById('st-loop').addEventListener('change', function () {
        t.sampler.loop = !!this.checked;
        saveTracks();
        DAW.engine.rebuildChannel(t.id);
      });
    }

    document.getElementById('st-nlen').addEventListener('click', function (e) {
      var b = e.target.closest('[data-stnl]');
      if (!b) return;
      trk.noteLen = parseInt(b.getAttribute('data-stnl'), 10);
      this.querySelectorAll('button').forEach(function (x) {
        x.classList.toggle('active', x === b);
      });
    });
    document.getElementById('st-clear').addEventListener('click', function () {
      t.notes = [];
      saveTracks();
      drawRoll(t);
    });
    document.getElementById('st-roll').addEventListener('click', function (e) {
      var note = e.target.closest('.st-note');
      if (note) {
        t.notes.splice(parseInt(note.getAttribute('data-ni'), 10), 1);
        saveTracks();
        drawRoll(t);
        return;
      }
      var rect = this.getBoundingClientRect();
      var x = e.clientX - rect.left - 46;
      var y = e.clientY - rect.top;
      if (x < 0) return;
      var col = Math.floor(x / 22);
      var m = ROLL_HI - Math.floor(y / 14);
      if (col < 0 || col >= stepCols() || m < ROLL_LO || m > ROLL_HI) return;
      t.notes.push({ m: m, v: 100, t: col * 0.25, d: trk.noteLen * 0.25 });
      saveTracks();
      drawRoll(t);
      // audition
      try {
        var c = DAW.engine.liveChannel(t.id);
        if (c) {
          var ctx = App.getAudio();
          c.instrument.noteOn(m, 0.7, ctx.currentTime, 0);
          c.instrument.noteOff(m, ctx.currentTime + 0.3, 0);
        }
      } catch (err) { /* audio unavailable */ }
    });
  }

  function ideaToTrack(idea) {
    var t = newTrack('synth');
    t.name = idea.name.slice(0, 24);
    var maxEnd = 0;
    t.notes = idea.notes.map(function (n) {
      var tb = n.t * idea.bpm / 60;
      var db = Math.max(0.25, n.d * idea.bpm / 60);
      maxEnd = Math.max(maxEnd, tb + db);
      return { m: n.m, v: n.v, t: Math.round(tb * 4) / 4, d: Math.round(db * 4) / 4 };
    });
    var need = maxEnd <= 4 ? 1 : maxEnd <= 8 ? 2 : 4;
    if (need > DAW.engine.bars) DAW.engine.bars = need;
    saveTracks();
    App.switchTo('tracks');
    renderTransport();
    renderTracks();
    renderEditor2();
  }

  function initTracks(rootEl) {
    rootEl.innerHTML =
      '<div class="card">' +
        '<div class="row spread">' +
          '<span class="row tight">' +
            '<button type="button" class="btn big primary" id="st-play">' + App.icon('play', 15) + ' Play</button>' +
            '<label class="field">Loop<select id="st-bars">' +
              '<option value="1">1 bar</option><option value="2">2 bars</option><option value="4">4 bars</option></select></label>' +
          '</span>' +
          '<span class="row tight">' +
            '<button type="button" class="btn sm" id="st-addd">' + App.icon('plus', 13) + ' Drums</button>' +
            '<button type="button" class="btn sm" id="st-adds">' + App.icon('plus', 13) + ' Synth</button>' +
            '<button type="button" class="btn sm" id="st-addsm">' + App.icon('plus', 13) + ' Sampler</button>' +
            '<button type="button" class="btn sm" id="st-export" title="Render the loop to a downloadable WAV file">Export WAV</button>' +
          '</span>' +
        '</div>' +
        '<div class="muted small" style="margin-top:8px">Everything loops in sync at the tempo in the bar above. ' +
          'Arm <b>Live</b> on a track and your ROLI / typing keys play its instrument — with slide and pressure on the synth.</div>' +
        '<div id="st-list" style="margin-top:12px"></div>' +
      '</div>' +
      '<div class="card" id="st-editor"></div>';

    tels.play = document.getElementById('st-play');
    tels.bars = document.getElementById('st-bars');
    tels.list = document.getElementById('st-list');
    tels.editor = document.getElementById('st-editor');

    loadTracks();
    if (!trk.sel && tracksList().length) trk.sel = tracksList()[0].id;
    renderTransport();
    renderTracks();
    renderEditor2();

    tels.play.addEventListener('click', function () {
      if (DAW.engine.playing) DAW.engine.stop(); else DAW.engine.play();
    });
    tels.bars.addEventListener('change', function () {
      DAW.engine.bars = parseInt(this.value, 10);
      saveTracks();
      renderEditor2();
    });
    document.getElementById('st-addd').addEventListener('click', function () { newTrack('drums'); });
    document.getElementById('st-adds').addEventListener('click', function () { newTrack('synth'); });
    document.getElementById('st-addsm').addEventListener('click', function () { newTrack('sampler'); });
    document.getElementById('st-export').addEventListener('click', function () {
      if (!tracksList().length) return;
      var btn = this;
      btn.disabled = true;
      btn.textContent = 'Rendering…';
      DAW.engine.render().then(function (blob) {
        DAW.downloadBlob(blob, (App.store.get('song.name', 'soundLAB') || 'soundLAB').replace(/[^\w\- ]+/g, '') + '.wav');
        btn.disabled = false;
        btn.textContent = 'Export WAV';
      }).catch(function () {
        btn.disabled = false;
        btn.textContent = 'Export WAV';
      });
    });

    tels.list.addEventListener('click', function (e) {
      var arm = e.target.closest('[data-starm]');
      var mute = e.target.closest('[data-stmute]');
      var solo = e.target.closest('[data-stsolo]');
      var edit = e.target.closest('[data-stedit]');
      var del = e.target.closest('[data-stdel]');
      if (arm) {
        var id = arm.getAttribute('data-starm');
        App.store.set('st.armed', App.store.get('st.armed', null) === id ? null : id);
        renderTracks();
      } else if (mute) {
        var t1 = trackById(mute.getAttribute('data-stmute'));
        t1.mix.mute = !t1.mix.mute;
        saveTracks(); DAW.engine.applyMix(); renderTracks();
      } else if (solo) {
        var t2 = trackById(solo.getAttribute('data-stsolo'));
        t2.mix.solo = !t2.mix.solo;
        saveTracks(); DAW.engine.applyMix(); renderTracks();
      } else if (edit) {
        trk.sel = edit.getAttribute('data-stedit');
        renderTracks(); renderEditor2();
      } else if (del) {
        var id2 = del.getAttribute('data-stdel');
        DAW.engine.tracks = tracksList().filter(function (t) { return t.id !== id2; });
        if (App.store.get('st.armed', null) === id2) App.store.set('st.armed', null);
        idbDel(id2).catch(function () { /* ok */ });
        delete DAW.samples[id2];
        if (trk.sel === id2) trk.sel = tracksList().length ? tracksList()[0].id : null;
        saveTracks(); renderTracks(); renderEditor2();
      }
    });
    tels.list.addEventListener('input', function (e) {
      var vol = e.target.closest('[data-stvol]');
      if (!vol) return;
      trackById(vol.getAttribute('data-stvol')).mix.vol = parseInt(vol.value, 10);
      saveTracks(); DAW.engine.applyMix();
    });
    tels.list.addEventListener('change', function (e) {
      var nm = e.target.closest('[data-stname]');
      if (!nm) return;
      var t = trackById(nm.getAttribute('data-stname'));
      t.name = nm.value.slice(0, 30) || t.name;
      saveTracks();
      if (trk.sel === t.id) renderEditor2();
    });

    App.on('st:state', renderTransport);
    App.on('st:step', function (d) {
      // playhead over the roll + step grid
      var ph = document.getElementById('st-ph');
      if (ph) {
        ph.style.display = '';
        ph.setAttribute('x', String(46 + d.step * 22));
      }
      var grid = document.getElementById('st-steps');
      if (grid) {
        grid.querySelectorAll('.st-cell.st-now').forEach(function (c) { c.classList.remove('st-now'); });
        grid.querySelectorAll('.st-cell[data-step="' + d.step + '"]').forEach(function (c) { c.classList.add('st-now'); });
      }
    });
    App.on('fb:scale', function () { var t = trackById(trk.sel); if (t && t.kind !== 'drums') drawRoll(t); });
    App.on('fb:set', function () { var t = trackById(trk.sel); if (t && t.kind !== 'drums') drawRoll(t); });
  }

  // live MPE routing: armed track's instrument under your fingers
  function liveRoute(d, isOn, chan) {
    if (App.space !== 'studio') return;
    var id = App.store.get('st.armed', null);
    var t = id && trackById(id);
    if (!t) return;
    if (t.kind === 'drums') return; // pads.js owns note->lane drum mapping
    var c = DAW.engine.liveChannel(id);
    if (!c) return;
    var ctx = App.getAudio();
    if (isOn) {
      c.instrument.noteOn(d.midi, (d.vel || 90) / 127, ctx.currentTime, chan || 0);
      if (d.dur) c.instrument.noteOff(d.midi, ctx.currentTime + d.dur, chan || 0);
    } else {
      c.instrument.noteOff(d.midi, ctx.currentTime, chan || 0);
    }
  }

  // ---------------- song page (sketchbook, phase one) ----------------

  function renderSong() {
    if (!sels.meta) return;
    var n = ideas().length;
    sels.meta.textContent = keyName(App.store.get('fb.root', 9), App.store.get('fb.scale', 'major')) +
      ' · ' + Math.round(parseFloat(App.store.get('met.bpm', 100)) || 100) + ' BPM · ' +
      n + (n === 1 ? ' idea' : ' ideas');
  }

  function initSong(rootEl) {
    rootEl.innerHTML =
      '<div class="card">' +
        '<input id="sd-songname" class="sd-title" aria-label="Song name">' +
        '<div class="muted" id="sd-songmeta" style="margin-top:4px"></div>' +
        '<div class="muted small" style="margin-top:10px">Key and tempo live in the bar above — ' +
          'the whole studio follows them, and every capture is tagged with them automatically.</div>' +
        '<div class="row" style="margin-top:16px">' +
          '<button type="button" class="btn primary" id="sd-gotracks">' + App.icon('play', 15) + ' Tracks</button>' +
          '<button type="button" class="btn" id="sd-goideas">Ideas</button>' +
          '<button type="button" class="btn" id="sd-gojam">Jam on it</button>' +
          '<button type="button" class="btn" id="sd-gopiano">Play keys</button>' +
        '</div>' +
      '</div>' +
      '<div class="card">' +
        '<h2>Coming to the sketchbook</h2>' +
        '<div class="muted small">Sections with progressions (linked to the Jam), lyrics with chords over ' +
          'the words, and tracks built from your ideas. This page grows into the songwriter home — ' +
          'capture works everywhere already.</div>' +
      '</div>';

    sels.name = document.getElementById('sd-songname');
    sels.meta = document.getElementById('sd-songmeta');
    sels.name.value = App.store.get('song.name', 'Untitled song');
    sels.name.addEventListener('change', function () {
      App.store.set('song.name', this.value.slice(0, 80) || 'Untitled song');
    });
    document.getElementById('sd-gotracks').addEventListener('click', function () { App.switchTo('tracks'); });
    document.getElementById('sd-goideas').addEventListener('click', function () { App.switchTo('ideas'); });
    document.getElementById('sd-gojam').addEventListener('click', function () { App.switchTo('jam'); });
    document.getElementById('sd-gopiano').addEventListener('click', function () { App.switchTo('piano'); });
    renderSong();
  }

  // ---------------- wiring ----------------

  function init() {
    App.injectCSS('studio',
      '#cx-rec{position:relative}' +
      '#cx-rec::before{content:"";display:inline-block;width:9px;height:9px;border-radius:50%;' +
        'background:#d9484a;vertical-align:0}' +
      '#cx-rec.cx-rec-on{border-color:#d9484a;color:#ffd7d7;background:rgba(217,72,74,0.14)}' +
      '#cx-rec.cx-rec-on::before{animation:sd-pulse 1s ease-in-out infinite}' +
      '@keyframes sd-pulse{0%,100%{opacity:1}50%{opacity:0.35}}' +
      '#cx-rec-msg{font-size:12px;color:var(--muted);white-space:nowrap}' +
      '.sd-title{font-family:var(--font-condensed,var(--font-display));font-size:30px;font-weight:700;' +
        'background:transparent;border:none;border-bottom:1px dashed var(--line);color:var(--text);' +
        'padding:2px 0;width:100%;max-width:420px}' +
      '.sd-title:focus{outline:none;border-bottom-color:var(--accent)}' +
      '.sd-name{background:transparent;border:none;border-bottom:1px dashed transparent;color:var(--text);' +
        'font-family:inherit;font-size:15px;font-weight:600;min-width:0;width:150px;padding:2px 0}' +
      '.sd-name:focus{outline:none;border-bottom-color:var(--accent)}' +
      '.sd-idea{margin-top:10px;padding:12px 16px}' +
      '.st-row{display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid var(--line);flex-wrap:wrap}' +
      '.st-row.st-sel{background:rgba(255,255,255,0.03)}' +
      '.st-row .sd-name{width:110px;flex:0 0 auto}' +
      '.st-row input[type=range]{width:110px}' +
      '.st-kind{flex:1 1 auto;min-width:90px}' +
      '.st-arm.active{border-color:#d9484a;color:#ffd7d7;background:rgba(217,72,74,0.14)}' +
      '.st-grid{display:grid;gap:3px;overflow-x:auto;padding-bottom:6px}' +
      '.st-lane{font-size:11px;color:var(--muted);align-self:center;white-space:nowrap}' +
      '.st-cell{width:22px;height:26px;border-radius:5px;border:1px solid var(--line);background:var(--card2);cursor:pointer;padding:0}' +
      '.st-cell.st-beat{border-color:rgba(128,128,128,0.5)}' +
      '.st-cell.on{background:var(--accent);border-color:var(--accent)}' +
      '.st-cell.st-now{outline:2px solid rgba(255,255,255,0.5);outline-offset:-2px}' +
      '.st-rollwrap{overflow-x:auto;background:var(--card2);border:1px solid var(--line);border-radius:10px}' +
      '.st-note{cursor:pointer}'
    );

    // capture inputs: hardware MIDI (anywhere) + on-screen/QWERTY piano notes.
    // The same events drive live play on the armed studio track (MPE).
    App.on('midi:note', function (d) {
      inputEvent(d, 'midi');
      if (d) liveRoute(d, !!d.on, d.chan);
    });
    App.on('note:input', function (d) {
      inputEvent(d, d && d.src === 'touch' ? 'touch' : 'qwerty');
      if (d) liveRoute(d, !!d.on, 0);
    });
    App.on('midi:bend', function (d) {
      if (App.space !== 'studio' || !d) return;
      var id = App.store.get('st.armed', null);
      var c = id && DAW.engine.liveChannel(id);
      if (c && c.instrument.pitchBend) c.instrument.pitchBend(d.semis, d.chan || 0);
    });
    App.on('midi:pressure', function (d) {
      if (App.space !== 'studio' || !d) return;
      var id = App.store.get('st.armed', null);
      var c = id && DAW.engine.liveChannel(id);
      if (c && c.instrument.pressure) c.instrument.pressure(d.val, d.chan || 0);
    });

    var recBtn = document.getElementById('cx-rec');
    if (recBtn) {
      recBtn.addEventListener('click', function () {
        if (rec) stopRec(); else startRec();
        this.blur();
      });
    }
    paintRec();

    // song meta mirrors the shared context
    App.on('fb:scale', renderSong);
    App.on('fb:set', renderSong);
    App.on('tempo', renderSong);

    // settings changed the studio prefs (retro length / playback voice)
    App.on('sd:prefs', function () {
      var lbl = document.getElementById('sd-retro-label');
      if (lbl) lbl.textContent = 'Keep the last ' + retroSecs() + 's';
    });

    document.addEventListener('visibilitychange', function () {
      if (document.hidden) { stopPlayback(); if (window.DAW && DAW.engine) DAW.engine.stop(); }
    });
  }

  App.register('song', { init: function (el) { init(); initSong(el); } });
  App.register('ideas', { init: initIdeas, onHide: stopPlayback });
  App.register('tracks', {
    init: initTracks,
    onShow: function () {
      loadSampleBuffers();
      // tracks may have been created elsewhere (pads page) — adopt + repaint
      if (!trackById(trk.sel) && tracksList().length) trk.sel = tracksList()[0].id;
      renderTracks();
      renderEditor2();
      renderTransport();
    }
  });
})();
