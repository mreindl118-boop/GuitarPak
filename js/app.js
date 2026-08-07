/* GuitarLab application shell. Exposed as window.App.
 *
 * Module contract:
 *   App.register('name', {
 *     init(rootEl),   // required — build all DOM inside the panel element
 *     onShow(),       // optional — tab became visible
 *     onHide(),       // optional — tab hidden: stop sound/mic/timers here
 *     onKey(e)        // optional — keydown while this tab is active and focus
 *   });               //            is not in a text input / select
 *
 * Shared services:
 *   App.getAudio()                    lazily-created shared AudioContext (resumed)
 *   App.pluck(midi, when, dur, gain)  plucked-string voice — the sampled tone
 *                                     chosen in Settings (app.pluckTone:
 *                                     steel | electric | nylon | synth) with a
 *                                     synth fallback; `when` is seconds from
 *                                     now (audio-clock accurate).
 *                                     App.pluckSynth forces the synth voice;
 *                                     App.setPluckTone switches the tone.
 *   App.store.get(key, fallback) / App.store.set(key, value)   JSON localStorage
 *   App.injectCSS(id, cssText)        add module-specific styles once
 */
window.App = (function () {
  'use strict';

  var modules = {};
  var active = null;
  var audioCtx = null;
  var PANEL_ORDER = ['metronome', 'fretboard', 'chords', 'piano', 'jam', 'tuner', 'trainer', 'theory', 'settings'];

  // ---- auto-update ----
  // version.json on GitHub is the source of truth. Web builds refresh through
  // the service worker; the APK build (file://) links to the new APK download.
  var APP_VERSION = '0.32.2';
  var UPDATE_INFO_URL = 'https://raw.githubusercontent.com/mreindl118-boop/GuitarPak/main/version.json';

  function verNum(v) {
    var p = String(v).split('-')[0].split('.');
    return (parseInt(p[0], 10) || 0) * 1e6 + (parseInt(p[1], 10) || 0) * 1e3 + (parseInt(p[2], 10) || 0);
  }

  var lastUpdateCheck = 0;

  function checkForUpdate(force) {
    if (typeof fetch !== 'function') return;
    var now = Date.now();
    if (!force && now - lastUpdateCheck < 15 * 60 * 1000) return; // throttle re-checks
    lastUpdateCheck = now;
    fetch(UPDATE_INFO_URL, { cache: 'no-store' })
      .then(function (r) { return r.json(); })
      .then(function (info) {
        if (info && info.version && verNum(info.version) > verNum(APP_VERSION)) showUpdateBanner(info);
      })
      .catch(function () {
        lastUpdateCheck = 0; // failed (offline / blocked) — allow an early retry
      });
  }

  function showUpdateBanner(info) {
    if (document.getElementById('app-update')) return;
    var bar = document.createElement('div');
    bar.id = 'app-update';
    var msg = document.createElement('span');
    msg.textContent = 'GuitarLab v' + String(info.version) + ' is available.';
    bar.appendChild(msg);

    var go = document.createElement('button');
    go.className = 'btn sm primary';
    if (location.protocol === 'file:') {
      go.textContent = 'Get update';
      go.onclick = function () {
        // plain navigation — the APK's WebViewClient routes it to the browser
        location.href = info.apk || 'https://github.com/mreindl118-boop/GuitarPak';
      };
    } else {
      go.textContent = 'Update now';
      go.onclick = function () {
        if ('serviceWorker' in navigator) {
          navigator.serviceWorker.getRegistration().then(function (reg) {
            if (reg) reg.update();
            // controllerchange triggers the reload; fall back if it doesn't
            setTimeout(function () { location.reload(); }, 1500);
          });
        } else {
          location.reload();
        }
      };
    }
    var later = document.createElement('button');
    later.className = 'btn sm';
    later.textContent = 'Later';
    later.onclick = function () { bar.parentNode.removeChild(bar); };
    bar.appendChild(go);
    bar.appendChild(later);
    document.body.appendChild(bar);
  }

  function register(name, mod) {
    modules[name] = mod;
  }

  // ---- inline SVG icon set ----
  // Every pictographic control renders one of these instead of a bare unicode
  // glyph: characters like U+2195 fall back to emoji on iOS and broke the
  // practice strip. stroke/fill = currentColor, so icons follow button color.
  var ICONS = {
    play: '<path d="M8 5.4v13.2L18.6 12z" fill="currentColor" stroke="none"/>',
    pause: '<path d="M8.5 5.5v13M15.5 5.5v13" stroke-width="2.6"/>',
    stop: '<rect x="6.5" y="6.5" width="11" height="11" rx="1.5" fill="currentColor" stroke="none"/>',
    restart: '<polyline points="1.5 4.5 1.5 10.5 7.5 10.5"/><path d="M3.8 15a9 9 0 1 0 2-9.5L1.5 10"/>',
    rotate: '<polyline points="22.5 4.5 22.5 10.5 16.5 10.5"/><path d="M20.2 15a9 9 0 1 1-2-9.5l4.3 4.5"/>',
    up: '<path d="M12 19V5"/><polyline points="5 12 12 5 19 12"/>',
    down: '<path d="M12 5v14"/><polyline points="19 12 12 19 5 12"/>',
    updown: '<path d="M12 4.5v15"/><polyline points="8 8.5 12 4.5 16 8.5"/><polyline points="16 15.5 12 19.5 8 15.5"/>',
    left: '<path d="M19 12H5"/><polyline points="12 19 5 12 12 5"/>',
    right: '<path d="M5 12h14"/><polyline points="12 5 19 12 12 19"/>',
    expand: '<path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"/>',
    close: '<path d="M18 6 6 18M6 6l12 12"/>',
    sliders: '<path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3"/><path d="M1.5 14h5M9.5 8h5M17.5 16h5"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    minus: '<path d="M5 12h14"/>',
    pickdown: '<path d="M6 19.5v-9a6 6 0 0 1 12 0v9"/>',
    pickup: '<path d="M5 5.5 12 19l7-13.5"/>'
  };

  function icon(name, size) {
    var d = ICONS[name];
    if (!d) return '';
    var s = size || 18;
    return '<svg class="ic" width="' + s + '" height="' + s + '" viewBox="0 0 24 24" fill="none" ' +
      'stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" ' +
      'aria-hidden="true" focusable="false">' + d + '</svg>';
  }

  function getAudio() {
    if (!audioCtx) {
      var Ctx = window.AudioContext || window.webkitAudioContext;
      audioCtx = new Ctx();
    }
    if (audioCtx.state === 'suspended') audioCtx.resume();
    decodeGuitar(); // turn any prefetched sample bytes into playable buffers
    return audioCtx;
  }

  // ---- sampled pluck voice (FluidR3 GM — samples/CREDITS.md) ----
  // The pluck instrument is an app-level setting (app.pluckTone: steel |
  // electric | nylon | synth, Settings tab). Anchor-note MP3s for the chosen
  // tone are prefetched as raw bytes (XHR, because fetch() refuses file://
  // inside the APK's WebView) and decoded once the shared AudioContext
  // exists. App.pluck plays the nearest anchor pitch-shifted with a few cents
  // of random detune and level variation so repeated notes don't sound
  // stamped out; the synth voice stays as the automatic fallback and is
  // exposed as App.pluckSynth for callers that want it on purpose.
  // The guitar banks are REAL recorded notes (tonejs-instruments, see
  // samples/CREDITS.md) — long natural ring at mastered level, unlike the
  // soundfont renders that read as harpsichord. trim = per-set loudness
  // compensation, RMS-measured at each source switch.
  var PLUCK_SETS = {
    steel: { dir: 'samples/guitar/', trim: 0.35, notes: {
      40: 'E2', 45: 'A2', 48: 'C3', 52: 'E3', 55: 'G3', 59: 'B3',
      64: 'E4', 67: 'G4', 69: 'A4', 72: 'C5', 74: 'D5' } },
    electric: { dir: 'samples/eguitar/', trim: 0.67, notes: {
      40: 'E2', 45: 'A2', 48: 'C3', 57: 'A3', 66: 'Fs4', 69: 'A4',
      72: 'C5', 78: 'Fs5', 81: 'A5' } },
    nylon: { dir: 'samples/nylon/', trim: 0.26, notes: {
      40: 'E2', 45: 'A2', 50: 'D3', 55: 'G3', 59: 'B3', 64: 'E4',
      69: 'A4', 74: 'D5', 76: 'E5', 81: 'A5' } }
  };
  var pluckRaw = { steel: {}, electric: {}, nylon: {} };  // tone -> midi -> bytes
  var pluckBuf = { steel: {}, electric: {}, nylon: {} };  // tone -> midi -> AudioBuffer
  var pluckReadyN = { steel: 0, electric: 0, nylon: 0 };
  var pluckFetched = {};

  function pluckTonePref() {
    var t = store.get('app.pluckTone', 'steel');
    return (t === 'electric' || t === 'nylon' || t === 'synth') ? t : 'steel';
  }

  function setPluckTone(tone) {
    if (tone !== 'electric' && tone !== 'nylon' && tone !== 'synth') tone = 'steel';
    store.set('app.pluckTone', tone);
    prefetchPluck(tone); // start loading now; notes switch over as it decodes
  }

  function prefetchPluck(tone) {
    var set = PLUCK_SETS[tone];
    if (!set || pluckFetched[tone]) return;
    pluckFetched[tone] = true;
    Object.keys(set.notes).forEach(function (m) {
      var xhr = new XMLHttpRequest();
      xhr.open('GET', set.dir + set.notes[m] + '.mp3', true);
      xhr.responseType = 'arraybuffer';
      xhr.onload = function () {
        if ((xhr.status === 200 || xhr.status === 0) && xhr.response) {
          pluckRaw[tone][m] = xhr.response;
          if (audioCtx) decodeGuitar();
        }
      };
      try { xhr.send(); } catch (e) { /* blocked — synth fallback */ }
    });
  }

  // keep only what playback uses: the recordings ring for 10+ seconds, but a
  // pluck never sustains past ~2 s — a mono 3.2 s window with a fade keeps
  // ~85% of the decoded-PCM memory out of RAM
  function condense(buf, secs) {
    var sr = buf.sampleRate;
    var n = Math.min(buf.length, Math.floor(secs * sr));
    var out = audioCtx.createBuffer(1, n, sr);
    var dst = out.getChannelData(0);
    var a = buf.getChannelData(0);
    var b = buf.numberOfChannels > 1 ? buf.getChannelData(1) : null;
    for (var i = 0; i < n; i++) dst[i] = b ? (a[i] + b[i]) * 0.5 : a[i];
    var fade = Math.min(n, Math.floor(0.25 * sr));
    for (i = 0; i < fade; i++) dst[n - 1 - i] *= i / fade;
    return out;
  }

  function decodeGuitar() {
    if (!audioCtx) return;
    Object.keys(pluckRaw).forEach(function (tone) {
      Object.keys(pluckRaw[tone]).forEach(function (m) {
        var bytes = pluckRaw[tone][m];
        delete pluckRaw[tone][m]; // decodeAudioData detaches the buffer
        audioCtx.decodeAudioData(bytes, function (buf) {
          pluckBuf[tone][m] = condense(buf, 3.2);
          pluckReadyN[tone]++;
        }, function () { /* undecodable — synth fallback */ });
      });
    });
  }

  // Plucked-string voice shared by fretboard / chords / jam / trainer:
  // the chosen sampled tone when its bank is decoded, synth twin otherwise.
  function pluck(midi, when, dur, gain) {
    var ctx = getAudio();
    var t = ctx.currentTime + Math.max(0, when || 0);
    dur = dur || 1.2;
    gain = gain == null ? 0.4 : gain;
    var tone = pluckTonePref();
    if (tone === 'synth') { pluckSynth(midi, when, dur, gain); return; }
    prefetchPluck(tone); // no-op once requested
    var bank = pluckBuf[tone];
    if (!pluckReadyN[tone] && pluckReadyN.steel) bank = pluckBuf.steel; // still decoding — steel stands in
    var best = null, bd = 99;
    for (var m in bank) {
      var d = Math.abs(midi - m);
      if (d < bd) { bd = d; best = Number(m); }
    }
    // as long as the bank is decoded, always pitch-shift the nearest anchor —
    // a far shift still sounds like a guitar, the synth fallback does not
    // (that fallback above the old top anchor was the "harpsichord above
    // fret 12" bug)
    if (best !== null) {
      var src = ctx.createBufferSource();
      src.buffer = bank[best];
      // ±4 cents; midi may be fractional (tuner calibration) — that's fine here
      src.playbackRate.value = Math.pow(2, (midi - best + (Math.random() - 0.5) * 0.08) / 12);
      var lv = gain * (PLUCK_SETS[tone] ? PLUCK_SETS[tone].trim : 1.4) * (0.92 + Math.random() * 0.16);
      var g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(lv, t + 0.003);
      // hold, then an exponential tail — a linear gate chops the string's
      // natural ring and is exactly what sounds robotic on scale runs
      var rel = Math.min(0.35, Math.max(0.12, dur * 0.35));
      g.gain.setValueAtTime(lv, t + Math.max(0.02, dur - rel));
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.05);
      src.connect(g);
      g.connect(ctx.destination);
      src.start(t);
      src.stop(t + dur + 0.1);
      return;
    }
    pluckSynth(midi, when, dur, gain);
  }

  function pluckSynth(midi, when, dur, gain) {
    var ctx = getAudio();
    // never schedule in the past — a past-dated envelope collapses to silence
    var t = ctx.currentTime + Math.max(0, when || 0);
    dur = dur || 1.2;
    gain = gain == null ? 0.4 : gain;
    var f = Theory.noteFreq(midi);

    var osc = ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.value = f;

    var lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(Math.min(f * 6, 9000), t);
    lp.frequency.exponentialRampToValueAtTime(Math.max(f * 1.4, 200), t + dur);

    var g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);

    osc.connect(lp);
    lp.connect(g);
    g.connect(ctx.destination);
    osc.start(t);
    osc.stop(t + dur + 0.05);
  }

  var store = {
    get: function (key, fallback) {
      try {
        var v = localStorage.getItem('guitarlab.' + key);
        return v == null ? fallback : JSON.parse(v);
      } catch (e) {
        return fallback;
      }
    },
    set: function (key, value) {
      try {
        localStorage.setItem('guitarlab.' + key, JSON.stringify(value));
      } catch (e) { /* storage unavailable — settings just won't persist */ }
    }
  };

  // ---- tiny event bus (cross-module links, e.g. shared tempo) ----
  var busListeners = {};

  function on(evt, fn) {
    (busListeners[evt] = busListeners[evt] || []).push(fn);
  }

  function emit(evt, data) {
    var list = busListeners[evt] || [];
    for (var i = 0; i < list.length; i++) {
      try { list[i](data); } catch (e) { console.error('bus:' + evt, e); }
    }
  }

  function injectCSS(id, cssText) {
    if (document.getElementById('css-' + id)) return;
    var s = document.createElement('style');
    s.id = 'css-' + id;
    s.textContent = cssText;
    document.head.appendChild(s);
  }

  // ---- theme (dark is the default "stage gear" look) ----
  // Preference (app.theme): 'dark' | 'light' | 'auto'. 'auto' follows the
  // device via prefers-color-scheme, live — changed from the Settings tab.
  var darkMQ = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;

  function applyTheme(pref) {
    var t = pref === 'auto' ? (darkMQ && !darkMQ.matches ? 'light' : 'dark') : pref;
    if (t !== 'light') t = 'dark';
    document.documentElement.setAttribute('data-theme', t);
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', t === 'light' ? '#f3efe8' : '#131114');
  }

  function setTheme(pref) {
    if (pref !== 'dark' && pref !== 'light' && pref !== 'auto') pref = 'dark';
    store.set('app.theme', pref);
    applyTheme(pref);
  }

  if (darkMQ && darkMQ.addEventListener) {
    darkMQ.addEventListener('change', function () {
      if (store.get('app.theme', 'dark') === 'auto') applyTheme('auto');
    });
  }

  // ---- keep the screen awake during active practice ----
  // Ref-counted: a module calls App.wake.acquire(tag) the instant an activity
  // starts (audio playing, a practice runner stepping, a timer counting, the
  // mic live) and App.wake.release(tag) the instant it stops. The screen is held
  // awake while >= 1 tag is held. Each tag is idempotent (acquire twice = held
  // once), so start/stop must stay balanced on every path. Two backends, tried
  // together:
  //   * Screen Wake Lock API  — PWA / any https (secure) context
  //   * GuitarLabHost bridge  — the Android APK; file:// is not a secure context
  //                             so wakeLock is absent there, and the WebView
  //                             toggles FLAG_KEEP_SCREEN_ON instead
  // Silent no-op when neither exists (e.g. a plain file:// browser tab).
  var wakeHolders = {};
  var wakeCount = 0;
  var wakeSentinel = null;

  function applyWake() {
    var host = window.GuitarLabHost;
    if (host && typeof host.setKeepScreenOn === 'function') {
      try { host.setKeepScreenOn(wakeCount > 0); } catch (e) { /* bridge gone */ }
    }
    if ('wakeLock' in navigator) {
      var want = wakeCount > 0 && !document.hidden;
      if (want && !wakeSentinel) {
        navigator.wakeLock.request('screen').then(function (s) {
          // request() is async — if we stopped wanting it meanwhile, drop it now
          if (wakeCount > 0 && !document.hidden) {
            wakeSentinel = s;
            s.addEventListener('release', function () { wakeSentinel = null; });
          } else {
            s.release().catch(function () {});
          }
        }).catch(function () { /* rejected (low battery / not allowed) — non-fatal */ });
      } else if (!want && wakeSentinel) {
        wakeSentinel.release().catch(function () {});
        wakeSentinel = null;
      }
    }
  }

  var wake = {
    acquire: function (tag) {
      if (!tag || wakeHolders[tag]) return;
      wakeHolders[tag] = true;
      wakeCount++;
      applyWake();
    },
    release: function (tag) {
      if (!tag || !wakeHolders[tag]) return;
      delete wakeHolders[tag];
      wakeCount = Math.max(0, wakeCount - 1);
      applyWake();
    },
    reapply: applyWake, // the browser auto-drops the lock on tab-hide; re-request on return
    get active() { return wakeCount > 0; }
  };

  function switchTo(name) {
    if (name === active) return;
    if (active && modules[active] && modules[active].onHide) {
      try { modules[active].onHide(); } catch (e) { console.error(active + '.onHide', e); }
    }
    active = name;
    var nav = document.getElementById('nav-select');
    if (nav && nav.value !== name) nav.value = name;
    document.querySelectorAll('.tab').forEach(function (b) {
      b.classList.toggle('active', b.dataset.panel === name);
    });
    document.querySelectorAll('.panel').forEach(function (p) {
      p.classList.toggle('active', p.id === 'panel-' + name);
    });
    if (modules[name] && modules[name].onShow) {
      try { modules[name].onShow(); } catch (e) { console.error(name + '.onShow', e); }
    }
    store.set('app.tab', name);
  }

  // ---- persistent context bar: key / scale / mode / bpm / time ----
  // The single home for the shared musical context. Pushes changes through the
  // existing bus (fb:set -> fretboard applies and re-announces fb:scale, which
  // chords + tab follow; tempo + sig -> metronome/jam) and mirrors changes made
  // anywhere else back into its widgets.
  var CX_SIGS = ['2/4', '3/4', '4/4', '5/4', '6/8', '7/8', '9/8', '12/8']; // keep in sync with metronome

  function wireContextBar() {
    var root = document.getElementById('cx-root');
    var scale = document.getElementById('cx-scale');
    var mode = document.getElementById('cx-mode');
    var modeWrap = document.getElementById('cx-mode-wrap');
    var bpm = document.getElementById('cx-bpm');
    var sig = document.getElementById('cx-sig');
    if (!root) return;

    var pc, h = '';
    for (pc = 0; pc < 12; pc++) {
      h += '<option value="' + pc + '">' + Theory.pcName(pc, Theory.FLAT_KEYS.has(pc)) + '</option>';
    }
    root.innerHTML = h;
    h = '';
    Theory.SCALE_ORDER.forEach(function (id) {
      h += '<option value="' + id + '">' + Theory.SCALES[id].name + '</option>';
    });
    scale.innerHTML = h;
    h = '';
    CX_SIGS.forEach(function (s) { h += '<option value="' + s + '">' + s + '</option>'; });
    sig.innerHTML = h;

    function curRoot() { var v = store.get('fb.root', 9); return (typeof v === 'number' && v >= 0 && v < 12) ? Math.floor(v) : 9; }
    function curScale() { var v = store.get('fb.scale', 'minorPent'); return Theory.SCALES[v] ? v : 'minorPent'; }
    function curMode() { var v = store.get('fb.mode', 1); return (typeof v === 'number' && v >= 1 && v <= 7) ? Math.floor(v) : 1; }

    function refreshModeSel() {
      var sc = Theory.SCALES[curScale()];
      if (!sc || sc.steps.length !== 7) { modeWrap.style.display = 'none'; return; }
      modeWrap.style.display = '';
      var info = Theory.scaleInfo(curRoot(), curScale());
      var m = curMode(), k, o = '';
      for (k = 1; k <= 7; k++) {
        o += '<option value="' + k + '"' + (k === m ? ' selected' : '') + '>' +
          k + ' \u00b7 ' + info.names[k - 1] + '</option>';
      }
      mode.innerHTML = o;
    }

    // custom typed signatures (metronome tab) get their own option so the bar
    // can always DISPLAY the real signature, whatever it is
    function showSig(v) {
      if (!/^\d{1,2}\/\d{1,2}$/.test(String(v))) v = '4/4';
      var has = false, i;
      for (i = 0; i < sig.options.length; i++) if (sig.options[i].value === v) { has = true; break; }
      if (!has) {
        var o = document.createElement('option');
        o.value = o.textContent = v;
        sig.appendChild(o);
      }
      sig.value = v;
    }

    function refreshAll() {
      root.value = String(curRoot());
      scale.value = curScale();
      refreshModeSel();
      bpm.value = String(Math.max(30, Math.min(280, parseInt(store.get('met.bpm', 120), 10) || 120)));
      showSig(store.get('met.sig', '4/4'));
    }
    refreshAll();

    function pushMusic(patch) {
      var payload = { source: 'bar', root: curRoot(), scale: curScale(), mode: curMode() };
      for (var k in patch) payload[k] = patch[k];
      store.set('fb.root', payload.root);
      store.set('fb.scale', payload.scale);
      store.set('fb.mode', payload.mode);
      emit('fb:set', payload);
    }

    root.addEventListener('change', function () {
      var v = parseInt(this.value, 10);
      if (!isNaN(v)) { pushMusic({ root: ((v % 12) + 12) % 12 }); refreshModeSel(); }
    });
    scale.addEventListener('change', function () {
      if (Theory.SCALES[this.value]) { pushMusic({ scale: this.value, mode: 1 }); refreshModeSel(); }
    });
    mode.addEventListener('change', function () {
      var k = parseInt(this.value, 10);
      if (k >= 1 && k <= 7) pushMusic({ mode: k });
    });
    bpm.addEventListener('change', function () {
      var v = parseInt(this.value, 10);
      if (isNaN(v)) v = 120;
      v = Math.max(30, Math.min(280, v));
      this.value = String(v);
      store.set('met.bpm', v);
      emit('tempo', { bpm: v, source: 'bar' });
    });
    sig.addEventListener('change', function () {
      if (CX_SIGS.indexOf(this.value) === -1) return;
      store.set('met.sig', this.value);
      emit('sig', { sig: this.value, source: 'bar' });
    });

    // metronome transport: one button, live on every tab
    var met = document.getElementById('cx-met');
    if (met) {
      met.innerHTML = icon('play', 14);
      met.addEventListener('click', function () { emit('met:toggle', {}); });
      on('met:state', function (d) {
        var runs = !!(d && d.running);
        met.classList.toggle('on', runs);
        met.innerHTML = runs ? icon('stop', 14) : icon('play', 14);
        if (!runs) met.classList.remove('tick');
      });
      var tickTimer = null;
      on('met:beat', function () {
        met.classList.add('tick');
        if (tickTimer) clearTimeout(tickTimer);
        tickTimer = setTimeout(function () { met.classList.remove('tick'); }, 110);
      });
    }

    // mirror changes made anywhere else
    on('fb:scale', function () { refreshAll(); });
    on('fb:set', function (d) { if (d && d.source !== 'bar') refreshAll(); });
    on('tempo', function (d) {
      if (d && d.source !== 'bar') bpm.value = String(Math.max(30, Math.min(280, Math.round(d.bpm))));
    });
    on('sig', function (d) {
      if (d && d.source !== 'bar') showSig(d.sig);
    });
  }

  function boot() {
    PANEL_ORDER.forEach(function (name) {
      var el = document.getElementById('panel-' + name);
      var mod = modules[name];
      if (!el) return;
      if (!mod) {
        el.innerHTML = '<div class="error">Module "' + name + '" failed to load (script error?). Check the console.</div>';
        return;
      }
      try {
        mod.init(el);
      } catch (e) {
        console.error('init ' + name, e);
        el.innerHTML = '<div class="error">Module "' + name + '" crashed during init: ' + e.message + '</div>';
      }
    });

    // single page-picker menu (native select = native picker sheet on mobile)
    var navSel = document.getElementById('nav-select');
    if (navSel) {
      navSel.addEventListener('change', function () {
        if (PANEL_ORDER.indexOf(this.value) !== -1) switchTo(this.value);
      });
    }
    var tabsEl = document.getElementById('tabs');
    if (tabsEl) {
      tabsEl.addEventListener('click', function (e) {
        var btn = e.target.closest('.tab');
        if (btn) switchTo(btn.dataset.panel);
      });
    }

    document.addEventListener('keydown', function (e) {
      var t = e.target;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return;
      var mod = modules[active];
      if (mod && mod.onKey) mod.onKey(e);
    });

    applyTheme(store.get('app.theme', 'dark'));
    wireContextBar();

    var startTab = store.get('app.tab', 'metronome');
    if (PANEL_ORDER.indexOf(startTab) === -1) startTab = 'metronome';
    switchTo(startTab);

    var foot = document.querySelector('.foot');
    if (foot) foot.textContent += ' · v' + APP_VERSION;

    // silent web auto-update: when an updated service worker takes control of
    // a page that already had one, reload once to pick up the new assets
    if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
      var hadController = !!navigator.serviceWorker.controller;
      var reloaded = false;
      navigator.serviceWorker.addEventListener('controllerchange', function () {
        if (hadController && !reloaded) {
          reloaded = true;
          location.reload();
        }
      });
    }

    prefetchPluck('steel');            // universal fallback / stand-in bank
    prefetchPluck(pluckTonePref());    // the chosen tone (no-op if steel/synth)

    // update checks: at every app start, when the network comes back, when the
    // app returns to the foreground (throttled), and during long sessions
    checkForUpdate(true);
    window.addEventListener('online', function () { checkForUpdate(); });
    document.addEventListener('visibilitychange', function () {
      wake.reapply(); // re-request the screen lock the browser dropped on hide
      if (!document.hidden) checkForUpdate();
    });
    setInterval(function () { checkForUpdate(); }, 4 * 60 * 60 * 1000);
  }

  return {
    register: register,
    icon: icon,
    getAudio: getAudio,
    pluck: pluck,
    pluckSynth: pluckSynth,
    setPluckTone: setPluckTone,
    get pluckTone() { return pluckTonePref(); },
    get pluckSampled() { return pluckReadyN.steel + pluckReadyN.electric + pluckReadyN.nylon > 0; },
    store: store,
    on: on,
    emit: emit,
    injectCSS: injectCSS,
    wake: wake,
    setTheme: setTheme,
    get themePref() { return store.get('app.theme', 'dark'); },
    switchTo: switchTo,
    boot: boot,
    version: APP_VERSION,
    checkForUpdate: checkForUpdate,
    get active() { return active; }
  };
})();
