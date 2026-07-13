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
 *   App.pluck(midi, when, dur, gain)  simple plucked-string voice; `when` is seconds
 *                                     from now (audio-clock accurate)
 *   App.store.get(key, fallback) / App.store.set(key, value)   JSON localStorage
 *   App.injectCSS(id, cssText)        add module-specific styles once
 */
window.App = (function () {
  'use strict';

  var modules = {};
  var active = null;
  var audioCtx = null;
  var PANEL_ORDER = ['metronome', 'fretboard', 'chords', 'jam', 'tuner', 'trainer'];

  // ---- auto-update ----
  // version.json on GitHub is the source of truth. Web builds refresh through
  // the service worker; the APK build (file://) links to the new APK download.
  var APP_VERSION = '0.7.0';
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
    return audioCtx;
  }

  // Simple plucked-string voice shared by fretboard / chords / trainer.
  function pluck(midi, when, dur, gain) {
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
    store: store,
    on: on,
    emit: emit,
    injectCSS: injectCSS,
    wake: wake,
    switchTo: switchTo,
    boot: boot,
    version: APP_VERSION,
    checkForUpdate: checkForUpdate,
    get active() { return active; }
  };
})();
