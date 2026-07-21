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
  var PANEL_ORDER = ['metronome', 'fretboard', 'chords', 'jam', 'tuner', 'trainer', 'settings'];

  // ---- auto-update ----
  // version.json on GitHub is the source of truth. Web builds refresh through
  // the service worker; the APK build (file://) links to the new APK download.
  var APP_VERSION = '0.21.0';
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
  var PLUCK_SETS = {
    steel: { dir: 'samples/guitar/', notes: {
      40: 'E2', 45: 'A2', 48: 'C3', 50: 'D3', 53: 'F3', 55: 'G3', 57: 'A3',
      59: 'B3', 62: 'D4', 64: 'E4', 67: 'G4', 72: 'C5', 76: 'E5' } },
    electric: { dir: 'samples/eguitar/', notes: {
      40: 'E2', 45: 'A2', 50: 'D3', 55: 'G3', 59: 'B3', 64: 'E4', 67: 'G4', 72: 'C5' } },
    nylon: { dir: 'samples/nylon/', notes: {
      40: 'E2', 45: 'A2', 50: 'D3', 55: 'G3', 59: 'B3', 64: 'E4', 67: 'G4', 72: 'C5' } }
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

  function decodeGuitar() {
    if (!audioCtx) return;
    Object.keys(pluckRaw).forEach(function (tone) {
      Object.keys(pluckRaw[tone]).forEach(function (m) {
        var bytes = pluckRaw[tone][m];
        delete pluckRaw[tone][m]; // decodeAudioData detaches the buffer
        audioCtx.decodeAudioData(bytes, function (buf) {
          pluckBuf[tone][m] = buf;
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
    if (best !== null && bd <= 4.5) {
      var src = ctx.createBufferSource();
      src.buffer = bank[best];
      // ±4 cents; midi may be fractional (tuner calibration) — that's fine here
      src.playbackRate.value = Math.pow(2, (midi - best + (Math.random() - 0.5) * 0.08) / 12);
      var lv = gain * 1.4 * (0.92 + Math.random() * 0.16);
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

    function refreshAll() {
      root.value = String(curRoot());
      scale.value = curScale();
      refreshModeSel();
      bpm.value = String(Math.max(30, Math.min(280, parseInt(store.get('met.bpm', 120), 10) || 120)));
      var sv = store.get('met.sig', '4/4');
      sig.value = CX_SIGS.indexOf(sv) !== -1 ? sv : '4/4';
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
      met.addEventListener('click', function () { emit('met:toggle', {}); });
      on('met:state', function (d) {
        var runs = !!(d && d.running);
        met.classList.toggle('on', runs);
        met.innerHTML = runs ? '&#9632;' : '&#9654;';
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
      if (d && d.source !== 'bar' && CX_SIGS.indexOf(d.sig) !== -1) sig.value = d.sig;
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

    document.getElementById('tabs').addEventListener('click', function (e) {
      var btn = e.target.closest('.tab');
      if (btn) switchTo(btn.dataset.panel);
    });

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
