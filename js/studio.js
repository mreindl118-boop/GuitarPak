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
      var b = e.target.closest('[data-iplay],[data-idel],[data-ikey]');
      if (!b) return;
      var idea;
      if (b.hasAttribute('data-iplay')) {
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
          '<button type="button" class="btn primary" id="sd-goideas">' + App.icon('play', 15) + ' Ideas</button>' +
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
      '.sd-idea{margin-top:10px;padding:12px 16px}'
    );

    // capture inputs: hardware MIDI (anywhere) + on-screen/QWERTY piano notes
    App.on('midi:note', function (d) { inputEvent(d, 'midi'); });
    App.on('note:input', function (d) { inputEvent(d, d && d.src === 'touch' ? 'touch' : 'qwerty'); });

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
      if (document.hidden) stopPlayback();
    });
  }

  App.register('song', { init: function (el) { init(); initSong(el); } });
  App.register('ideas', { init: initIdeas, onHide: stopPlayback });
})();
