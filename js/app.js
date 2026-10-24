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
  // Two workspaces over one app: Practice (the original tool set) and Studio
  // (the DAW side). One clock, one key, one MIDI service — the context bar
  // stays put; only the page set changes, behind a screen-wipe transition.
  // Settings is deliberately in NEITHER list: it's an overlay page opened by
  // the ever-present gear in the header, from any page in either space.
  var SPACES = {
    practice: ['quiz', 'practiceplan', 'fretboard', 'tab', 'notation', 'helix', 'chords', 'piano', 'synth', 'pads', 'midihub', 'lumipractice', 'songs', 'jam', 'shed', 'tuner', 'trainer', 'theory'],
    studio: ['arrange', 'tracks', 'song', 'ideas']
  };
  var SPACE_LABELS = {
    metronome: 'Metronome', fretboard: 'Fretboard', tab: 'Tab', notation: 'Notation',
    chords: 'Chords', piano: 'Piano', songs: 'Songs', jam: 'Jam', tuner: 'Tuner',
    trainer: 'Trainer', theory: 'Theory', settings: 'Settings', shed: 'Shed', synth: 'Synth',
    song: 'Song', arrange: 'Arrange', tracks: 'Tracks', pads: 'Pads', ideas: 'Ideas',
    quiz: 'Exercises', midihub: 'MIDI Hub', lumipractice: 'LUMI practice', practiceplan: 'Practice plan', helix: 'Helix Stadium'
  };
  // overlays live outside both page sets: the metronome opens as a SHEET over
  // whatever page you're on (corner icon), settings toggles in place (gear)
  var PANEL_ORDER = SPACES.practice.concat(SPACES.studio).concat(['metronome', 'lights', 'settings']);
  // Tab GROUPS: related pages share one entry in the page menu; the members
  // show as a sub-tab strip under the context bar. Pages/modules are untouched
  // — this is navigation only, so cross-links (fb:practice, st:edit, plugin
  // pages) keep addressing pages by id and the owning group follows along.
  var GROUPS = {
    practice: [
      { id: 'gtheory', label: 'Learn', icon: 'learn', pages: ['quiz', 'chords', 'theory', 'practiceplan'] }, // Exercises = the home
      { id: 'ginst', label: 'Guitar', icon: 'guitar', pages: ['fretboard', 'tab', 'notation', 'helix'] }, // helix = Helix Stadium (js/helix.js)
      { id: 'gkeys', label: 'Keys', icon: 'keys', pages: ['piano', 'synth', 'pads', 'midihub', 'lumipractice'] }, // midihub = the MIDI Hub (js/midihub.js)
      { id: 'gplay', label: 'Play', icon: 'note', pages: ['songs', 'jam'] },
      { id: 'gprac', label: 'Practice', icon: 'target', pages: ['shed', 'trainer', 'tuner'] } // the game first
    ],
    studio: [
      { id: 'gstudio', label: 'Studio', icon: 'sliders', pages: ['arrange', 'tracks'] }, // the DAW home
      { id: 'gsketch', label: 'Sketch', icon: 'idea', pages: ['song', 'ideas'] }
    ]
  };
  // short member names for the strip (fall back to SPACE_LABELS)
  var SUB_LABELS = {
    fretboard: 'Neck', tab: 'Tab', notation: 'Notation', piano: 'Piano',
    chords: 'Chords', theory: 'Circle', songs: 'Songs', jam: 'Jam',
    trainer: 'Trainer', shed: 'Woodshed', metronome: 'Metronome', tuner: 'Tuner',
    song: 'Song', ideas: 'Ideas', tracks: 'Editor', arrange: 'Timeline', pads: 'Pads', synth: 'Synth',
    quiz: 'Exercises', midihub: 'MIDI', lumipractice: 'LUMI', practiceplan: 'Plan', helix: 'Helix'
  };

  function groupOf(name) {
    var gs = GROUPS.practice.concat(GROUPS.studio);
    for (var i = 0; i < gs.length; i++) {
      if (gs[i].pages.indexOf(name) !== -1) return gs[i];
    }
    return null;
  }
  var space = 'practice';
  var prevTab = null; // where the gear came from, to toggle back to

  // ---- auto-update ----
  // version.json on GitHub is the source of truth. It carries TWO channels:
  //   web      the latest web build — browsers, the PWA and the Android app
  //            (which runs the live site) refresh through the service worker
  //   version  the APK file in releases/ — ONLY bumped by android/build.ps1
  //            when an APK is actually built. Older APKs read nothing else, so
  //            this must never run ahead of the real file: when it did, the
  //            Android app kept downloading the same old APK in a loop.
  var APP_VERSION = '1.0.0';
  var UPDATE_INFO_URL = 'https://raw.githubusercontent.com/mreindl118-boop/GuitarPak/main/version.json';

  function verNum(v) {
    var p = String(v).split('-')[0].split('.');
    return (parseInt(p[0], 10) || 0) * 1e6 + (parseInt(p[1], 10) || 0) * 1e3 + (parseInt(p[2], 10) || 0);
  }

  var lastUpdateCheck = 0;

  function checkForUpdate(force) {
    if (window.SL_ARTIFACT) return; // the artifact is republished, not updated
    if (typeof fetch !== 'function') return;
    var now = Date.now();
    if (!force && now - lastUpdateCheck < 15 * 60 * 1000) return; // throttle re-checks
    lastUpdateCheck = now;
    fetch(UPDATE_INFO_URL, { cache: 'no-store' })
      .then(function (r) { return r.json(); })
      .then(function (info) {
        if (!info) return;
        var bundled = location.protocol === 'file:', shell = shellVersion();
        if (bundled || shell) {
          // inside the Android app: offer a download only for a genuinely
          // newer APK than the one installed
          var mine = shell || APP_VERSION;
          if (info.version && info.apk && verNum(info.version) > verNum(mine)) { showUpdateBanner(info, 'apk'); return; }
          if (bundled) return; // the bundled offline copy can't refresh itself
        }
        var latest = info.web || info.version;
        if (latest && verNum(latest) > verNum(APP_VERSION)) showUpdateBanner({ version: latest }, 'web');
      })
      .catch(function () {
        lastUpdateCheck = 0; // failed (offline / blocked) — allow an early retry
      });
  }

  // the Android app's own version (its JS bridge) — '' everywhere else
  function shellVersion() {
    var h = window.GuitarLabHost;
    try { return h && typeof h.shellVersion === 'function' ? String(h.shellVersion() || '') : ''; } catch (e) { return ''; }
  }

  function showUpdateBanner(info, kind) {
    if (document.getElementById('app-update')) return;
    var bar = document.createElement('div');
    bar.id = 'app-update';
    var msg = document.createElement('span');
    msg.textContent = kind === 'apk'
      ? 'A new soundLAB Android app (v' + String(info.version) + ') is available.'
      : 'soundLAB v' + String(info.version) + ' is available.';
    bar.appendChild(msg);

    var go = document.createElement('button');
    go.className = 'btn sm primary';
    if (kind === 'apk') {
      go.textContent = 'Download';
      go.onclick = function () {
        // plain navigation — the APK's WebViewClient routes it to the browser
        location.href = info.apk;
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
  // Drawn from Lucide (https://lucide.dev, ISC license, icons/LUCIDE-LICENSE.txt)
  // so every icon shares one 24px grid and 2px stroke; transport glyphs are
  // filled. pickdown/pickup are the guitar pick-stroke marks (not in Lucide);
  // clef is an original G-clef stroke on the same grid.
  var ICONS = {
    clef: '<path d="M13.2 2.5c2.5 2.4 1.5 4.7-.7 6.9l-3.3 3.1c-3.2 3-2.5 7.3 1.2 8.2 4.7 1.1 7.7-3.3 5.7-6.7-1.8-3.1-6.7-2.2-6.7.7 0 1.5 1.2 2.3 2.5 2.3"/><path d="M12 3.8c-.9 2.7-.7 4.7.1 7.3l2.2 8.1c.8 2.9-.8 4.3-2.6 3.8-1.3-.4-1.7-1.6-1.3-2.5"/>',
    play: '<path d="M5 5a2 2 0 0 1 3.008-1.728l11.997 6.998a2 2 0 0 1 .003 3.458l-12 7A2 2 0 0 1 5 19z" fill="currentColor"/>',
    pause: '<rect x="6" y="4" width="4" height="16" rx="1" fill="currentColor"/><rect x="14" y="4" width="4" height="16" rx="1" fill="currentColor"/>',
    stop: '<rect x="5" y="5" width="14" height="14" rx="2" fill="currentColor"/>',
    restart: '<path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/>',
    rotate: '<path d="M12 5H6a2 2 0 0 0-2 2v3"/><path d="m9 8 3-3-3-3"/><path d="M4 14v4a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2"/>', // rotate-cw-square: turn the board (restart is the plain arrow)
    record: '<circle cx="12" cy="12" r="7" fill="currentColor"/>',
    up: '<path d="m5 12 7-7 7 7"/><path d="M12 19V5"/>',
    down: '<path d="M12 5v14"/><path d="m19 12-7 7-7-7"/>',
    updown: '<path d="m21 16-4 4-4-4"/><path d="M17 20V4"/><path d="m3 8 4-4 4 4"/><path d="M7 4v16"/>',
    left: '<path d="m12 19-7-7 7-7"/><path d="M19 12H5"/>',
    right: '<path d="M5 12h14"/><path d="m12 5 7 7-7 7"/>',
    expand: '<path d="M8 3H5a2 2 0 0 0-2 2v3"/><path d="M21 8V5a2 2 0 0 0-2-2h-3"/><path d="M3 16v3a2 2 0 0 0 2 2h3"/><path d="M16 21h3a2 2 0 0 0 2-2v-3"/>',
    close: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
    sliders: '<path d="M10 8h4"/><path d="M12 21v-9"/><path d="M12 8V3"/><path d="M17 16h4"/><path d="M19 12V3"/><path d="M19 21v-5"/><path d="M3 14h4"/><path d="M5 10V3"/><path d="M5 21v-7"/>',
    plus: '<path d="M5 12h14"/><path d="M12 5v14"/>',
    minus: '<path d="M5 12h14"/>',
    learn: '<path d="M21.42 10.922a1 1 0 0 0-.019-1.838L12.83 5.18a2 2 0 0 0-1.66 0L2.6 9.08a1 1 0 0 0 0 1.832l8.57 3.908a2 2 0 0 0 1.66 0z"/><path d="M22 10v6"/><path d="M6 12.5V16a6 3 0 0 0 12 0v-3.5"/>',
    guitar: '<path d="m11.9 12.1 4.514-4.514"/><path d="M20.1 2.3a1 1 0 0 0-1.4 0l-1.114 1.114A2 2 0 0 0 17 4.828v1.344a2 2 0 0 1-.586 1.414A2 2 0 0 1 17.828 7h1.344a2 2 0 0 0 1.414-.586L21.7 5.3a1 1 0 0 0 0-1.4z"/><path d="m6 16 2 2"/><path d="M8.23 9.85A3 3 0 0 1 11 8a5 5 0 0 1 5 5 3 3 0 0 1-1.85 2.77l-.92.38A2 2 0 0 0 12 18a4 4 0 0 1-4 4 6 6 0 0 1-6-6 4 4 0 0 1 4-4 2 2 0 0 0 1.85-1.23z"/>',
    keys: '<path d="M10 13v4"/><path d="M14 13v4"/><path d="M18 13v4"/><path d="M2 13h20"/><path d="M22 11.5A3.5 3.5 0 0018.5 8a3.52 3.52 0 01-3.173-2A7 7 0 002 9v10a2 2 0 002 2h16a2 2 0 002-2z"/><path d="M6 13v4"/>',
    note: '<path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>',
    target: '<circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/>',
    idea: '<path d="M13.4 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-7.4"/><path d="M2 6h4"/><path d="M2 10h4"/><path d="M2 14h4"/><path d="M2 18h4"/><path d="M21.378 5.626a1 1 0 1 0-3.004-3.004l-5.01 5.012a2 2 0 0 0-.506.854l-.837 2.87a.5.5 0 0 0 .62.62l2.87-.837a2 2 0 0 0 .854-.506z"/>',
    lights: '<path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5"/><path d="M9 18h6"/><path d="M10 22h4"/>',
    metronome: '<path d="M12 11.4V9.1"/><path d="m12 17 6.59-6.59"/><path d="m15.05 5.7-.218-.691a3 3 0 0 0-5.663 0L4.418 19.695A1 1 0 0 0 5.37 21h13.253a1 1 0 0 0 .951-1.31L18.45 16.2"/><circle cx="20" cy="9" r="2"/>',
    help: '<circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><path d="M12 17h.01"/>',
    gear: '<path d="M9.671 4.136a2.34 2.34 0 0 1 4.659 0 2.34 2.34 0 0 0 3.319 1.915 2.34 2.34 0 0 1 2.33 4.033 2.34 2.34 0 0 0 0 3.831 2.34 2.34 0 0 1-2.33 4.033 2.34 2.34 0 0 0-3.319 1.915 2.34 2.34 0 0 1-4.659 0 2.34 2.34 0 0 0-3.32-1.915 2.34 2.34 0 0 1-2.33-4.033 2.34 2.34 0 0 0 0-3.831A2.34 2.34 0 0 1 6.35 6.051a2.34 2.34 0 0 0 3.319-1.915"/><circle cx="12" cy="12" r="3"/>',
    bolt: '<path d="M15.914 4a1.5 1.5 0 00-2.474-1.561l-9 9A1.5 1.5 0 005.5 14h4.002a.5.5 0 01.471.666L8.086 20a1.5 1.5 0 002.475 1.56l9-9A1.5 1.5 0 0018.5 10h-3.997a.5.5 0 01-.472-.667z"/>',
    flame: '<path d="M12 3q1 4 4 6.5t3 5.5a1 1 0 0 1-14 0 5 5 0 0 1 1-3 1 1 0 0 0 5 0c0-2-1.5-3-1.5-5q0-2 2.5-4"/>',
    snow: '<path d="m10 20-1.25-2.5L6 18"/><path d="M10 4 8.75 6.5 6 6"/><path d="m14 20 1.25-2.5L18 18"/><path d="m14 4 1.25 2.5L18 6"/><path d="m17 21-3-6h-4"/><path d="m17 3-3 6 1.5 3"/><path d="M2 12h6.5L10 9"/><path d="m20 10-1.5 2 1.5 2"/><path d="M22 12h-6.5L14 15"/><path d="m4 10 1.5 2L4 14"/><path d="m7 21 3-6-1.5-3"/><path d="m7 3 3 6h4"/>',
    lock: '<rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
    check: '<path d="M20 6 9 17l-5-5"/>',
    clock: '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>',
    ear: '<path d="M6 8.5a6.5 6.5 0 1 1 13 0c0 6-6 6-6 10a3.5 3.5 0 1 1-7 0"/><path d="M15 8.5a2.5 2.5 0 0 0-5 0v1a2 2 0 1 1 0 4"/>',
    star: '<path d="M11.525 2.295a.53.53 0 0 1 .95 0l2.31 4.679a2.123 2.123 0 0 0 1.595 1.16l5.166.756a.53.53 0 0 1 .294.904l-3.736 3.638a2.123 2.123 0 0 0-.611 1.878l.882 5.14a.53.53 0 0 1-.771.56l-4.618-2.428a2.122 2.122 0 0 0-1.973 0L6.396 21.01a.53.53 0 0 1-.77-.56l.881-5.139a2.122 2.122 0 0 0-.611-1.879L2.16 9.795a.53.53 0 0 1 .294-.906l5.165-.755a2.122 2.122 0 0 0 1.597-1.16z"/>',
    faster: '<path d="m5 12 7-7 7 7"/><path d="M12 19V5"/>',
    slower: '<path d="M12 5v14"/><path d="m19 12-7 7-7-7"/>',
    infinity: '<path d="M6 16c5 0 7-8 12-8a4 4 0 0 1 0 8c-5 0-7-8-12-8a4 4 0 1 0 0 8"/>',
    timer: '<line x1="10" x2="14" y1="2" y2="2"/><line x1="12" x2="15" y1="14" y2="11"/><circle cx="12" cy="14" r="8"/>',
    trophy: '<path d="M10 14.66V17a1 1 0 0 1-1 1 2 2 0 0 0-2 2v2"/><path d="M14 14.66V17a1 1 0 0 0 1 1 2 2 0 0 1 2 2v2"/><path d="M17.916 10H19.5A2.5 2.5 0 0 0 22 7.5V5a1 1 0 0 0-1-1h-3"/><path d="M4 22h16"/><path d="M6 9a6 6 0 0 0 12 0V3a1 1 0 0 0-1-1H7a1 1 0 0 0-1 1z"/><path d="M6.084 10H4.5A2.5 2.5 0 0 1 2 7.5V5a1 1 0 0 1 1-1h3"/>',
    mic: '<path d="M12 19v3"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><rect x="9" y="2" width="6" height="13" rx="3"/>',
    drum: '<path d="m2 2 8 8"/><path d="m22 2-8 8"/><ellipse cx="12" cy="9" rx="10" ry="5"/><path d="M7 13.4v7.9"/><path d="M12 14v8"/><path d="M17 13.4v7.9"/><path d="M2 9v8a10 5 0 0 0 20 0V9"/>',
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

  // ---- master volume ----
  // One gain node between everything and the speakers. Modules connect to
  // ctx.destination as always — the instance property is shadowed to point at
  // the master gain, so every voice in the app obeys the Settings slider
  // without any module knowing about it.
  var masterGain = null;

  function volPref() {
    var v = parseInt(store.get('app.vol', 100), 10);
    return (v >= 0 && v <= 100) ? v : 100;
  }

  function setVolume(v) {
    v = Math.max(0, Math.min(100, Math.round(v)));
    store.set('app.vol', v);
    if (masterGain && audioCtx) masterGain.gain.setTargetAtTime(v / 100, audioCtx.currentTime, 0.02);
  }

  // unity gain below 0.8, then a smooth knee that tops out near 1.0 for
  // inputs up to 2.0 (the pre-gain of 0.5 maps that range onto -1..1)
  function softClipCurve() {
    var n = 2048, c = new Float32Array(n);
    for (var i = 0; i < n; i++) {
      var y = (i / (n - 1)) * 4 - 2, a = Math.abs(y);
      var v = a < 0.8 ? a : 0.8 + 0.2 * Math.tanh((a - 0.8) / 0.2);
      c[i] = y < 0 ? -v : v;
    }
    return c;
  }

  function getAudio() {
    if (!audioCtx) {
      var Ctx = window.AudioContext || window.webkitAudioContext;
      // explicit low-latency request — some WebViews default higher; the
      // real number lands in baseLatency/outputLatency (shown in Settings)
      try { audioCtx = new Ctx({ latencyHint: 0.005 }); } // as tight as the hardware allows
      catch (e) { try { audioCtx = new Ctx({ latencyHint: 'interactive' }); } catch (e2) { audioCtx = new Ctx(); } }
      var speakers = audioCtx.destination;
      masterGain = audioCtx.createGain();
      masterGain.gain.value = volPref() / 100;
      // app-wide soft clipper: chords, the jam band and the studio stack
      // voices — without it the sum clips harshly at the DAC. A WaveShaper
      // with oversample 'none' adds ZERO delay; the DynamicsCompressor used
      // before carries a fixed ~6ms lookahead on every note.
      var pre = audioCtx.createGain();
      pre.gain.value = 0.5; // the curve spans +-2 of headroom
      var clip = audioCtx.createWaveShaper();
      clip.curve = softClipCurve();
      clip.oversample = 'none';
      masterGain.connect(pre);
      pre.connect(clip);
      clip.connect(speakers);
      try {
        Object.defineProperty(audioCtx, 'destination', { value: masterGain, configurable: true });
      } catch (e) { /* locked down — app plays at full volume */ }
    }
    // 'interrupted' = WebKit after a call / Siri / another app took the audio
    if (audioCtx.state === 'suspended' || audioCtx.state === 'interrupted') audioCtx.resume();
    decodeGuitar(); // turn any prefetched sample bytes into playable buffers
    return audioCtx;
  }

  // ---- sample lead-in trim ----
  // MP3 renders carry encoder padding + un-trimmed silence at the front (the
  // grand piano bank measures ~28ms, guitar ~46ms, pad ~71ms) — every sampled
  // note spoke LATE by that much. Compute each buffer's lead-in once (first
  // sample above 2% of peak, keeping 2ms of natural ramp) and start playback
  // past it. Cached straight on the AudioBuffer.
  function analyzeSample(buf) {
    if (buf.__lead !== undefined) return;
    var d = buf.getChannelData(0);
    var peak = 0, i;
    for (i = 0; i < d.length; i++) { var a = d[i] < 0 ? -d[i] : d[i]; if (a > peak) peak = a; }
    var th = peak * 0.02;
    for (i = 0; i < d.length; i++) { if ((d[i] < 0 ? -d[i] : d[i]) > th) break; }
    var lead = Math.max(0, i / buf.sampleRate - 0.001);
    buf.__lead = lead > 0.004 ? lead : 0; // ignore negligible lead-ins
    // the banks are mastered at wildly different levels (peaks 0.07..0.7 —
    // ~19dB apart!): normalize every buffer toward a 0.6 peak so switching
    // voices doesn't swing the volume tenfold
    buf.__norm = peak > 0.001 ? Math.min(4, 0.6 / peak) : 1;
  }

  function sampleLead(buf) {
    if (!buf) return 0;
    analyzeSample(buf);
    return buf.__lead;
  }

  function sampleNorm(buf) {
    if (!buf) return 1;
    analyzeSample(buf);
    return buf.__norm;
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
          analyzeSample(pluckBuf[tone][m]); // lead/level scan now, not on first note
          pluckReadyN[tone]++;
        }, function () { /* undecodable — synth fallback */ });
      });
    });
  }

  // Plucked-string voice shared by fretboard / chords / jam / trainer:
  // the chosen sampled tone when its bank is decoded, synth twin otherwise.
  var pluckVoices = [];
  function trackPluck(node, gain) {
    var voice = { node: node, gain: gain };
    pluckVoices.push(voice);
    node.onended = function () { var i = pluckVoices.indexOf(voice); if (i >= 0) pluckVoices.splice(i, 1); };
  }
  function clearPlucks() {
    pluckVoices.splice(0).forEach(function (v) {
      try { v.gain.gain.cancelScheduledValues(0); v.gain.gain.value = 0; v.node.stop(0); } catch (e) { /* already ended */ }
    });
  }
  function pluck(midi, when, dur, gain) {
    if (!lockAllows(midi)) return;
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
      lv = lv * sampleNorm(src.buffer);
      g.gain.linearRampToValueAtTime(lv, t + 0.003);
      // hold, then an exponential tail — a linear gate chops the string's
      // natural ring and is exactly what sounds robotic on scale runs
      var rel = Math.min(0.35, Math.max(0.12, dur * 0.35));
      g.gain.setValueAtTime(lv, t + Math.max(0.02, dur - rel));
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.05);
      src.connect(g);
      g.connect(ctx.destination);
      trackPluck(src, g);
      src.start(t, sampleLead(src.buffer));
      src.stop(t + dur + 0.1);
      return;
    }
    pluckSynth(midi, when, dur, gain);
  }

  function pluckSynth(midi, when, dur, gain) {
    if (!lockAllows(midi)) return;
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
    trackPluck(osc, g);
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

  // first=true puts a listener at the FRONT: instruments that make sound
  // register this way so audio is scheduled before any page repaints
  function on(evt, fn, first) {
    var list = (busListeners[evt] = busListeners[evt] || []);
    if (first) list.unshift(fn); else list.push(fn);
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

  // ---- accent color ----
  // Amber is the stylesheet default; the others override the accent custom
  // properties inline (per current theme, for contrast) so every accent-aware
  // style — buttons, wordmark LAB, glows, active states — follows along.
  var ACCENTS = {
    amber:  { name: 'Amber',  dark: ['#ffab47', '#c97f26', 'rgba(255,171,71,0.35)'],  light: ['#d97e0f', '#b96a10', 'rgba(217,126,15,0.28)'] },
    teal:   { name: 'Teal',   dark: ['#4cc9b0', '#31a38d', 'rgba(76,201,176,0.35)'],  light: ['#0e9b80', '#0b8069', 'rgba(14,155,128,0.28)'] },
    violet: { name: 'Violet', dark: ['#b18cff', '#8b64d9', 'rgba(177,140,255,0.35)'], light: ['#7d54d4', '#6743b3', 'rgba(125,84,212,0.30)'] },
    coral:  { name: 'Coral',  dark: ['#ff7a66', '#d95742', 'rgba(255,122,102,0.35)'], light: ['#d94f39', '#b53f2c', 'rgba(217,79,57,0.28)'] }
  };

  function applyAccent() {
    var id = store.get('app.accent', 'amber');
    if (!ACCENTS[id]) id = 'amber';
    var st = document.documentElement.style;
    if (id === 'amber') {
      st.removeProperty('--accent');
      st.removeProperty('--accent-dim');
      st.removeProperty('--accent-glow');
      return;
    }
    var theme = document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark';
    var c = ACCENTS[id][theme];
    st.setProperty('--accent', c[0]);
    st.setProperty('--accent-dim', c[1]);
    st.setProperty('--accent-glow', c[2]);
  }

  function setAccent(id) {
    if (!ACCENTS[id]) id = 'amber';
    store.set('app.accent', id);
    applyAccent();
  }

  function applyTheme(pref) {
    var t = pref === 'auto' ? (darkMQ && !darkMQ.matches ? 'light' : 'dark') : pref;
    if (t !== 'light') t = 'dark';
    document.documentElement.setAttribute('data-theme', t);
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', t === 'light' ? '#f3efe8' : '#131114');
    applyAccent(); // accent shades are theme-specific
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

  function wakeWanted() {
    return wakeCount > 0 && store.get('app.keepAwake', true) !== false;
  }

  function applyWake() {
    var host = window.GuitarLabHost;
    if (host && typeof host.setKeepScreenOn === 'function') {
      try { host.setKeepScreenOn(wakeWanted()); } catch (e) { /* bridge gone */ }
    }
    if ('wakeLock' in navigator) {
      var want = wakeWanted() && !document.hidden;
      if (want && !wakeSentinel) {
        navigator.wakeLock.request('screen').then(function (s) {
          // request() is async — if we stopped wanting it meanwhile, drop it now
          if (wakeWanted() && !document.hidden) {
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
    held: function () { return Object.keys(wakeHolders); }, // xp.js times practice by tag
    get active() { return wakeCount > 0; }
  };

  function spaceOf(name) {
    return SPACES.studio.indexOf(name) !== -1 ? 'studio' : 'practice';
  }

  function tabStoreKey(sp) { return sp === 'studio' ? 'app.tabStudio' : 'app.tab'; }

  // SECTION TAB BAR — the app's main navigation: one tab per group of the
  // current space (icon + label). Rendered twice: in the top bar on wide
  // screens and fixed along the bottom on phones / portrait tablets (CSS
  // shows one). The pages inside a section are the pill strip (#subnav).
  function populateNav() {
    var cur = active && groupOf(active), h = '';
    GROUPS[space].forEach(function (g) {
      var on = cur === g;
      h += '<button type="button" class="tabbar-btn' + (on ? ' active' : '') + '" data-group="' + g.id + '"' +
        (on ? ' aria-current="page"' : '') + '>' + icon(g.icon || 'plus', 20) + '<span>' + g.label + '</span></button>';
    });
    ['tabbar', 'tabbar-m'].forEach(function (id) {
      var el = document.getElementById(id);
      if (el) el.innerHTML = h;
    });
  }

  function goGroup(gid) {
    var gs = GROUPS[space];
    for (var i = 0; i < gs.length; i++) {
      if (gs[i].id !== gid) continue;
      if (groupOf(active) === gs[i]) { window.scrollTo({ top: 0, behavior: 'smooth' }); return; } // tap the open tab: back to the top
      var pg = store.get('app.gtab.' + gid, gs[i].pages[0]);
      if (gs[i].pages.indexOf(pg) === -1) pg = gs[i].pages[0];
      switchTo(pg);
      return;
    }
  }

  function paintSubnav(name) {
    var el = document.getElementById('subnav');
    if (!el) return;
    var g = groupOf(name);
    if (!g || g.pages.length < 2) { el.hidden = true; el.innerHTML = ''; return; }
    var h = '';
    g.pages.forEach(function (p) {
      h += '<button type="button" class="subtab' + (p === name ? ' active' : '')
        + '" data-page="' + p + '">' + (SUB_LABELS[p] || SPACE_LABELS[p] || p) + '</button>';
    });
    el.innerHTML = h;
    el.hidden = false;
  }

  function paintGear() {
    var g = document.getElementById('settings-btn');
    if (g) g.classList.toggle('active', active === 'settings');
  }

  function switchTo(name) {
    if (sheet && !SHEETS[name]) closeSheet(); // going somewhere: the overlay steps aside
    if (name === active) return;
    // settings is space-agnostic: overlay in place, no wipe, no nav entry
    if (name === 'settings') {
      prevTab = active;
      if (active && modules[active] && modules[active].onHide) {
        try { modules[active].onHide(); } catch (e) { console.error(active + '.onHide', e); }
      }
      active = 'settings';
      document.querySelectorAll('.panel').forEach(function (p) {
        p.classList.toggle('active', p.id === 'panel-settings');
      });
      if (modules.settings && modules.settings.onShow) {
        try { modules.settings.onShow(); } catch (e) { console.error('settings.onShow', e); }
      }
      var sn = document.getElementById('subnav');
      if (sn) sn.hidden = true; // strip belongs to the page under the overlay
      populateNav(); // no section is current while settings is open
      paintGear();
      paintChrome();
      return;
    }
    // overlay utilities open over the current page instead of replacing it
    if (SHEETS[name]) { openSheet(name); return; }
    // crossing into the other workspace? go through the wipe
    if (spaceOf(name) !== space) { setSpace(spaceOf(name), name); return; }
    if (active && modules[active] && modules[active].onHide) {
      try { modules[active].onHide(); } catch (e) { console.error(active + '.onHide', e); }
    }
    if (!backNav && active && active !== 'settings' && visited[visited.length - 1] !== active) {
      visited.push(active);
      if (visited.length > 30) visited.shift();
    }
    guardUp();
    active = name;
    if (name === SPACES[space][0]) visited.length = 0; // home: Back from here leaves
    var g = groupOf(name);
    if (g) store.set('app.gtab.' + g.id, name); // remember the member per group
    populateNav();
    paintSubnav(name);
    document.querySelectorAll('.tab').forEach(function (b) {
      b.classList.toggle('active', b.dataset.panel === name);
    });
    document.querySelectorAll('.panel').forEach(function (p) {
      p.classList.toggle('active', p.id === 'panel-' + name);
    });
    if (modules[name] && modules[name].onShow) {
      try { modules[name].onShow(); } catch (e) { console.error(name + '.onShow', e); }
    }
    store.set(tabStoreKey(space), name);
    paintGear();
    paintChrome();
  }

  // Musical context belongs to the whole app, including Learn and Settings.
  // Modal utilities temporarily block its disclosure rather than cloning it.
  function paintChrome() {
    document.documentElement.classList.remove('noctx'); // old shell compatibility
    paintLock();
    closeCtx();
    showBar();
    syncContextAvailability();
    if (window.App && App.learnInstruments && typeof App.learnInstruments.refresh === 'function') App.learnInstruments.refresh();
  }

  // the clef button's dropdown (key / scale / mode / tempo / time + the
  // transport): open on tap, tucked away by a tap outside, Esc, Back, a page
  // switch or the top bar sliding away
  function ctxIsOpen() { return document.documentElement.classList.contains('ctx-open'); }
  function contextBlocked() {
    if (sheet || window.Help && Help.isOpen && Help.isOpen()) return true;
    return Array.prototype.some.call(document.querySelectorAll('dialog[open], [aria-modal="true"]'), function (el) {
      return !el.hidden && el.getClientRects().length > 0;
    });
  }
  function syncContextAvailability() {
    var blocked = contextBlocked(), b = document.getElementById('ctx-btn');
    if (b) { b.disabled = blocked; b.setAttribute('aria-disabled', String(blocked)); }
    if (blocked) closeCtx();
  }
  function setCtx(on) {
    on = !!on && !contextBlocked();
    document.documentElement.classList.toggle('ctx-open', on);
    var b = document.getElementById('ctx-btn'), bar = document.getElementById('ctxbar');
    if (b) { b.setAttribute('aria-expanded', String(on)); b.classList.toggle('active', on); }
    if (bar) bar.hidden = !on;
    if (on) {
      showBar();
      var first = bar && bar.querySelector('select, input, button');
      if (first) { try { first.focus({ preventScroll: true }); } catch (e) { first.focus(); } }
    }
  }
  function closeCtx() { if (ctxIsOpen()) setCtx(false); }

  // SCALE LOCK: global admission of pitched note events, including playback
  // and auditions. Raw answers/visuals remain available; explicit drums,
  // clicks and opaque recorded/live audio are outside note membership.
  function lockOn() { return store.get('scale.lock', false) === true; }
  function lockActive() { return lockOn(); }
  // Pure scale membership for an explicitly scale-locked external synth route.
  // Its cleanup/ownership must not depend on the page's app-sound exceptions.
  function scaleContains(midi) {
    var r = store.get('fb.root', 9), sc = store.get('fb.scale', 'minorPent');
    var info = Theory.scaleInfo(Theory.mod12(typeof r === 'number' ? r : 9), Theory.SCALES[sc] ? sc : 'minorPent');
    // Calibration may detune a nominal MIDI note fractionally; admission uses
    // its named key without quantizing the frequency sent to the voice.
    return Number.isFinite(midi) && info.pcToStep.has(Theory.mod12(Math.round(midi)));
  }
  function lockAllows(midi) { return !lockActive() || scaleContains(midi); }
  function paintLock() { document.documentElement.classList.toggle('scale-locked', lockActive()); }

  // The top bar slides away while you scroll DOWN a page and comes back on
  // the smallest scroll up (or at the top) — the screen goes to the page,
  // and navigation is never more than a flick away.
  var topbar = null, barHidden = false;
  function setBarHidden(h) {
    if (!topbar || h === barHidden) return;
    barHidden = h;
    topbar.classList.toggle('bar-hidden', h);
    if (h) closeCtx();
  }
  function showBar() { setBarHidden(false); }
  function wireAutoHideBar() {
    topbar = document.querySelector('.topbar');
    if (!topbar) return;
    var lastY = window.pageYOffset || 0;
    window.addEventListener('scroll', function () {
      var y = window.pageYOffset || 0, dy = y - lastY;
      if (y <= topbar.offsetHeight) { setBarHidden(false); lastY = y; return; }
      if (Math.abs(dy) < 8) return; // ignore jitter
      lastY = y;
      var ae = document.activeElement;
      if (dy > 0 && ae && ae.tagName === 'INPUT' && topbar.contains(ae)) return; // typing the BPM
      // the clef dropdown is open: a re-render after a pick can nudge the page
      // (scroll anchoring) — never read that as a scroll down; a real scroll
      // gesture starts with a tap outside, which closes it first
      if (dy > 0 && ctxIsOpen()) return;
      setBarHidden(dy > 0);
    }, { passive: true });
    topbar.addEventListener('focusin', showBar);
  }

  // plugin surface: add a whole page at runtime (SoundLab.registerPage)
  function addPage(id, label, sp, mod) {
    if (!id || !/^[a-z][a-z0-9_-]*$/.test(id) || PANEL_ORDER.indexOf(id) !== -1) return false;
    if (!mod || typeof mod.init !== 'function') return false;
    sp = SPACES[sp] ? sp : 'practice';
    var main = document.querySelector('main');
    if (!main) return false;
    var sec = document.createElement('section');
    sec.className = 'panel';
    sec.id = 'panel-' + id;
    main.appendChild(sec);
    SPACE_LABELS[id] = String(label || id).slice(0, 20);
    SPACES[sp].push(id);
    PANEL_ORDER.push(id);
    GROUPS[sp].push({ id: 'gpl-' + id, label: SPACE_LABELS[id], icon: 'plus', pages: [id] });
    SUB_LABELS[id] = SPACE_LABELS[id];
    modules[id] = mod;
    try {
      mod.init(sec);
    } catch (e) {
      console.error('plugin page ' + id, e);
      sec.innerHTML = '<div class="error">Plugin page "' + id + '" crashed during init: ' + e.message + '</div>';
    }
    populateNav();
    return true;
  }

  function toggleSettings() {
    if (active === 'settings') {
      var back = (prevTab && prevTab !== 'settings' && SPACES[space].indexOf(prevTab) !== -1)
        ? prevTab : store.get(tabStoreKey(space), SPACES[space][0]);
      if (SPACES[space].indexOf(back) === -1) back = SPACES[space][0];
      switchTo(back);
    } else {
      switchTo('settings');
    }
  }

  // ---- overlay sheets: utilities that open OVER the page you're on ----
  // The page underneath stays active (its runner, scroll and state are
  // untouched) and the sheet closes straight back to it: the corner icon,
  // the X, a tap outside the card, or Esc. Today: the metronome.
  var SHEETS = { metronome: 'met-btn', lights: 'lights-btn' };
  var sheet = null, sheetReturn = null;

  function openSheet(name) {
    if (!SHEETS[name] || sheet === name) return;
    if (sheet) closeSheet();
    var el = document.getElementById('sheet-' + name);
    if (!el) return;
    sheetReturn = document.activeElement;
    var context = document.getElementById('ctxbar');
    if (context && context.contains(sheetReturn)) sheetReturn = document.getElementById('ctx-btn');
    closeCtx();
    sheet = name;
    el.hidden = false;
    void el.offsetWidth; // commit before the entrance animation
    el.classList.add('open');
    document.documentElement.classList.add('sheet-open');
    syncContextAvailability();
    var b = document.getElementById(SHEETS[name]);
    if (b) { b.classList.add('active'); b.setAttribute('aria-expanded', 'true'); }
    if (modules[name] && modules[name].onShow) {
      try { modules[name].onShow(); } catch (e) { console.error(name + '.onShow', e); }
    }
    var x = el.querySelector('[data-sheet-close]');
    if (x) { try { x.focus({ preventScroll: true }); } catch (e) { /* old engines */ } }
    emit('sheet', { name: name, open: true }); // the page underneath can pause (quiz answer clock)
  }

  function closeSheet() {
    if (!sheet) return;
    var name = sheet, el = document.getElementById('sheet-' + name);
    sheet = null;
    if (el) { el.classList.remove('open'); el.hidden = true; }
    document.documentElement.classList.remove('sheet-open');
    syncContextAvailability();
    var b = document.getElementById(SHEETS[name]);
    if (b) { b.classList.remove('active'); b.setAttribute('aria-expanded', 'false'); }
    if (modules[name] && modules[name].onHide) {
      try { modules[name].onHide(); } catch (e) { console.error(name + '.onHide', e); }
    }
    var r = sheetReturn;
    sheetReturn = null;
    if (r && r.focus && document.body.contains(r)) { try { r.focus({ preventScroll: true }); } catch (e) { /* ok */ } }
    emit('sheet', { name: name, open: false });
  }

  function toggleSheet(name) { if (sheet === name) closeSheet(); else openSheet(name); }

  // ---- HELP LEVEL: the one difficulty knob for practice — how much the
  // screen and the keyboard's own lights show you (Keys page, scale lessons,
  // Exercises answer lights, a LUMI's keybed). 4 Full, 3 Colors, 2 Target,
  // 1 Tonic, 0 None. Set from the Keys page or the Lights & help sheet;
  // 'help:level' {level} on every change. (pn.assist is the v0.73 key.)
  var HELP_NAMES = ['None', 'Tonic', 'Target', 'Colors', 'Full'];
  function helpLevel() {
    var n = parseInt(store.get('help.level', store.get('pn.assist', 4)), 10);
    return n >= 0 && n <= 4 ? n : 4;
  }
  var help = {
    NAMES: HELP_NAMES,
    level: helpLevel,
    set: function (n) {
      n = parseInt(n, 10);
      if (!(n >= 0 && n <= 4) || n === helpLevel()) return;
      store.set('help.level', n);
      emit('help:level', { level: n });
    }
  };

  // ---- NOTE COLORS: the one palette behind every page and the LUMI keybed.
  // Mode 'interval' (default): all twelve semitones above the selected root,
  // seven natural colors (fb.colors) plus quantized neighboring-color blends.
  // Mode 'note': absolute pitch class, natural CDEFGAB anchors (fb.noteColors)
  // plus derived accidental blends. Every C keeps its color in every key.
  // Store fb.colorMode; emit 'colors' {mode, what} on changes. The legacy
  // forNote(pc, step) signature remains accepted, with step ignored.
  var HEX6 = /^#[0-9a-fA-F]{6}$/;
  // one bright color per degree, all light enough for dark label text
  var DEGREE_DEFAULTS = ['#ffab47', '#e8d44d', '#7ad97a', '#4cc9b0', '#6ea8fe', '#b48ef0', '#ff85b3'];
  // Preserve the legacy C..B source array in storage. Only its seven
  // natural anchors are editable; accidental values are derived below.
  // Displayed RGB is the same quantized program-table value sent to LUMI.
  var NOTE_DEFAULTS = ['#ff7583', '#ee9468', '#edb75a', '#f2de5f', '#c6f047', '#82ef6c',
    '#6cefad', '#39efef', '#6cb8ef', '#849bf5', '#a392f6', '#d27efc'];
  function validCols(c, n) {
    return Object.prototype.toString.call(c) === '[object Array]' && c.length === n &&
      c.every(function (x) { return typeof x === 'string' && HEX6.test(x); });
  }
  // forNote runs per key / dot on every repaint: parse a stored value only
  // when its raw string changed
  var colCache = {};
  // what a setter wrote when storage refused it (private window, blocked
  // site data, full quota): the choice still holds for this session
  var colMem = {};
  function colWrite(key, value) {
    store.set(key, value);
    var kept = false;
    try { kept = localStorage.getItem('guitarlab.' + key) === JSON.stringify(value); } catch (e) { /* no storage */ }
    if (kept) delete colMem[key]; else colMem[key] = { v: value };
  }
  function colRead(key, parse) {
    var m = colMem[key];
    if (m) { if (!('p' in m)) m.p = parse(m.v); return m.p; }
    var raw = null;
    try { raw = localStorage.getItem('guitarlab.' + key); } catch (e) { /* no storage */ }
    var c = colCache[key];
    if (c && c.raw === raw) return c.val;
    var v = null;
    try { v = raw == null ? null : JSON.parse(raw); } catch (e) { v = null; }
    v = parse(v);
    colCache[key] = { raw: raw, val: v };
    return v;
  }
  function colMode() { return colRead('fb.colorMode', function (v) { return v === 'note' ? 'note' : 'interval'; }); }
  function degCols() { return colRead('fb.colors', function (v) { return validCols(v, 7) ? v.slice() : DEGREE_DEFAULTS.slice(); }); }
  function noteCols() { return colRead('fb.noteColors', function (v) { return validCols(v, 12) ? v.slice() : NOTE_DEFAULTS.slice(); }); }
  function colorsChanged(what) { emit('colors', { mode: colMode(), what: what }); }
  var notePalette = window.SLNotePalette;
  function pitchSample(note) { return notePalette.sample(note, store.get('fb.root', 9), colMode(), degCols(), noteCols()); }
  var colors = {
    DEGREE_DEFAULTS: notePalette.mapped(DEGREE_DEFAULTS),
    NOTE_DEFAULTS: notePalette.notes(NOTE_DEFAULTS),
    mode: colMode,
    degrees: function () { return notePalette.mapped(degCols()); },
    notes: function () { return notePalette.notes(noteCols()); },
    sourceNotes: function () { return noteCols().slice(); },
    sourceDegrees: function () { return degCols().slice(); },
    chromatic: function () { return colMode() === 'note' ? notePalette.notes(noteCols()) : notePalette.intervals(degCols()); },
    // Chromatic pitch identity is independent of scale membership. The old
    // step argument remains accepted for call-site compatibility; interval
    // color now means one of all twelve semitones above the selected root.
    forNote: function (note, step) { var value = pitchSample(note); return value ? value.color : null; },
    forPitch: function (note) { var value = pitchSample(note); return value ? value.color : null; },
    lumiVelocity: function (note) { var value = pitchSample(note); return value ? value.velocity : null; },
    label: function (note) {
      var value = pitchSample(note);
      return !value ? '' : colMode() === 'note' ? Theory.pcName(value.pc, Theory.FLAT_KEYS.has(curRoot())) : value.label;
    },
    setMode: function (m) {
      m = m === 'note' ? 'note' : 'interval';
      if (m === colMode()) return;
      colWrite('fb.colorMode', m);
      colorsChanged('mode');
    },
    // an array of 12 (C..B) / 7 (degree 1..7) hex colors, or null = defaults
    setNotes: function (arr) {
      colWrite('fb.noteColors', validCols(arr, 12) ? arr.slice() : null);
      colorsChanged('notes');
    },
    setDegrees: function (arr) {
      colWrite('fb.colors', validCols(arr, 7) ? arr.slice() : null);
      colorsChanged('degrees');
    }
  };

  // ---- Back: Android's back gesture (and the browser's) walks back through
  // the app instead of leaving it: help tour, sheet, settings, the page's own
  // back (module.onBack() -> true when it handled it, e.g. a quiz run -> the
  // path), the previous page, the space's home. One guard entry sits on top
  // of the history; each Back pops it, we unwind one step and put it back.
  // With nothing left to unwind the guard stays down, a hint says the next
  // Back leaves, and any tap re-arms it.
  var visited = [], backNav = false, guarded = false, backHint = null;
  function guardUp() {
    if (guarded || !backWired) return;
    try { history.pushState({ sl: 'top' }, ''); guarded = true; } catch (e) { /* sandboxed frame */ }
  }
  var backWired = false;
  function goBackTo(p) { backNav = true; try { switchTo(p); } finally { backNav = false; } }
  function backStep() {
    if (window.Help && Help.isOpen && Help.isOpen()) { Help.close(); return true; }
    if (ctxIsOpen()) { closeCtx(); return true; }
    if (sheet) { closeSheet(); return true; }
    if (active === 'settings') { toggleSettings(); return true; }
    var m = modules[active];
    if (m && m.onBack) { try { if (m.onBack()) return true; } catch (e) { console.error(active + '.onBack', e); } }
    while (visited.length) {
      var p = visited.pop();
      if (p !== active && modules[p] && SPACES[spaceOf(p)] && !SHEETS[p]) { goBackTo(p); return true; }
    }
    if (space !== 'practice') { backNav = true; setSpace('practice'); setTimeout(function () { backNav = false; visited.length = 0; }, 700); return true; }
    if (active !== SPACES.practice[0]) { goBackTo(SPACES.practice[0]); return true; }
    return false;
  }
  function dropBackHint() { if (backHint) { backHint.remove(); backHint = null; } }
  function wireBack() {
    try { history.replaceState({ sl: 'base' }, ''); } catch (e) { return; }
    backWired = true;
    guardUp();
    window.addEventListener('popstate', function () {
      guarded = false;
      dropBackHint();
      if (backStep()) { guardUp(); return; }
      backHint = document.createElement('div');
      backHint.id = 'back-hint';
      backHint.setAttribute('role', 'status');
      backHint.textContent = 'Press Back again to leave soundLAB.';
      document.body.appendChild(backHint);
      setTimeout(dropBackHint, 2500);
    });
    // any tap after that re-arms the guard, so Back works again in-app
    document.addEventListener('pointerdown', function () { if (!guarded) { dropBackHint(); guardUp(); } }, true);
  }

  function wireSheets() {
    Object.keys(SHEETS).forEach(function (name) {
      var el = document.getElementById('sheet-' + name), b = document.getElementById(SHEETS[name]);
      if (b) {
        b.innerHTML = icon(name, 18);
        b.addEventListener('click', function () { toggleSheet(name); });
      }
      if (!el) return;
      var x = el.querySelector('[data-sheet-close]');
      if (x) x.innerHTML = icon('close', 16);
      var hb = el.querySelector('[data-sheet-help]');
      if (hb) {
        hb.innerHTML = icon('help', 16);
        hb.addEventListener('click', function () { if (window.Help) Help.open(name); });
      }
      el.addEventListener('click', function (e) {
        if (e.target === el || (e.target.closest && e.target.closest('[data-sheet-close]'))) closeSheet();
      });
    });
    // the corner icon tells you the click is running, and pulses on the beat
    var mb = document.getElementById('met-btn');
    if (mb) {
      var t = null;
      on('met:state', function (d) { mb.classList.toggle('on', !!(d && d.running)); if (!(d && d.running)) mb.classList.remove('tick'); });
      on('met:beat', function () {
        mb.classList.add('tick');
        if (t) clearTimeout(t);
        t = setTimeout(function () { mb.classList.remove('tick'); }, 110);
      });
    }
  }

  // ---- workspace wipe ----
  var wiping = false;
  var wipeId = 0; // each wipe's safety timers only ever touch their own wipe

  function applySpace(sp, tab) {
    space = sp;
    store.set('app.space', sp);
    document.documentElement.setAttribute('data-space', sp);
    var btn = document.getElementById('space-btn');
    if (btn) {
      btn.innerHTML = sp === 'studio'
        ? icon('left', 14) + ' Practice'
        : icon('right', 14) + ' Studio';
      btn.setAttribute('aria-label', sp === 'studio' ? 'Back to the practice tools' : 'Over to the studio');
    }
    populateNav();
    var next = tab || store.get(tabStoreKey(sp), SPACES[sp][0]);
    if (SPACES[sp].indexOf(next) === -1) next = SPACES[sp][0];
    switchTo(next);
    emit('space', { space: sp });
  }

  function setSpace(sp, tab) {
    if (sp === space || !SPACES[sp] || wiping) return;
    var wipe = document.getElementById('wipe');
    if (!wipe) { applySpace(sp, tab); return; }
    wiping = true;
    var my = ++wipeId;
    var toStudio = sp === 'studio';
    // sweep in from the side we're heading toward, swap under cover, sweep on
    wipe.style.transition = 'none';
    wipe.style.transform = 'translateX(' + (toStudio ? '102%' : '-102%') + ')';
    wipe.style.display = 'block';
    // force layout so the jump is committed before animating
    void wipe.offsetWidth;
    wipe.style.transition = 'transform 0.26s ease-in';
    wipe.style.transform = 'translateX(0)';
    var swapped = false;
    function onEnd() {
      if (!swapped) {
        swapped = true;
        applySpace(sp, tab);
        wipe.style.transition = 'transform 0.26s ease-out';
        wipe.style.transform = 'translateX(' + (toStudio ? '-102%' : '102%') + ')';
        return;
      }
      wipe.removeEventListener('transitionend', onEnd);
      wipe.style.display = 'none';
      wiping = false;
    }
    wipe.addEventListener('transitionend', onEnd);
    // safety: never leave the curtain stuck if transitionend is swallowed
    // (a quick second switch starts a new wipe: this one's timers stand down)
    setTimeout(function () {
      if (my !== wipeId) return;
      if (wiping && !swapped) onEnd();
      setTimeout(function () {
        if (my !== wipeId) return;
        if (wiping) { wipe.removeEventListener('transitionend', onEnd); wipe.style.display = 'none'; wiping = false; }
      }, 400);
    }, 400);
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
    // grouped: everyday scales first, then the families (any scale missing
    // from the groups still lands at the end, so nothing can disappear)
    var listed = {};
    (Theory.SCALE_GROUPS || []).forEach(function (g) {
      h += '<optgroup label="' + g.label + '">';
      g.ids.forEach(function (id) {
        if (!Theory.SCALES[id]) return;
        listed[id] = true;
        h += '<option value="' + id + '">' + Theory.SCALES[id].name + '</option>';
      });
      h += '</optgroup>';
    });
    Theory.SCALE_ORDER.forEach(function (id) {
      if (!listed[id]) h += '<option value="' + id + '">' + Theory.SCALES[id].name + '</option>';
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
      paintCtxBtn();
    }

    // the clef button names what's set, so you can check without opening it
    var cbtn = document.getElementById('ctx-btn'), cbar = document.getElementById('ctxbar');
    function paintCtxBtn() {
      if (!cbtn) return;
      var sc = Theory.SCALES[curScale()], t = 'Key, scale & tempo: ' + Theory.pcName(curRoot(), Theory.FLAT_KEYS.has(curRoot())) + ' ' +
        (sc ? sc.name.replace(/\s*\(.*\)$/, '') : '') + ' · ' + (parseInt(store.get('met.bpm', 120), 10) || 120) + ' BPM';
      cbtn.title = t;
      cbtn.setAttribute('aria-label', t);
    }
    if (cbtn && cbar) {
      cbtn.innerHTML = icon('clef', 28) + '<svg class="ctx-caret" viewBox="0 0 8 5" aria-hidden="true" focusable="false"><path d="m1 1 3 3 3-3"/></svg>';
      // A disclosure contains form controls, so it is not an ARIA menu.
      cbtn.removeAttribute('aria-haspopup');
      cbar.setAttribute('role', 'region');
      cbar.setAttribute('aria-label', 'Global key, scale, tempo and sound settings');
      cbar.hidden = !ctxIsOpen();
      cbtn.addEventListener('click', function () { setCtx(!ctxIsOpen()); });
      cbtn.addEventListener('keydown', function (e) {
        if (e.key === 'ArrowDown') { e.preventDefault(); setCtx(true); }
      });
      document.addEventListener('pointerdown', function (e) {
        if (ctxIsOpen() && !cbar.contains(e.target) && !cbtn.contains(e.target)) setCtx(false);
      }, true);
      document.addEventListener('keydown', function (e) {
        if (e.key !== 'Escape' || !ctxIsOpen()) return;
        setCtx(false);
        try { cbtn.focus({ preventScroll: true }); } catch (err) { /* old engines */ }
        e.stopPropagation();
        e.preventDefault();
      }, true);
      document.addEventListener('focusin', function (e) {
        if (ctxIsOpen() && !cbar.contains(e.target) && e.target !== cbtn) setCtx(false);
      });
      cbar.addEventListener('keydown', function (e) {
        if (e.key === 'Tab' && e.shiftKey && e.target === cbar.querySelector('select, input, button')) {
          e.preventDefault(); setCtx(false); cbtn.focus();
        }
      });
      ['sheet', 'tour'].forEach(function (event) { on(event, syncContextAvailability); });
      ['fb:set', 'tempo'].forEach(function (ev) { on(ev, paintCtxBtn); });
    }

    // the dropdown's two toggles: the keyboard's LEDs show the scale, and
    // scale lock (only in-key notes play)
    var ledB = document.getElementById('cx-led'), lockB = document.getElementById('cx-lock'), tnote = document.getElementById('cx-tnote');
    var colorOptions = document.createElement('div');
    colorOptions.className = 'seg cx-colors'; colorOptions.setAttribute('role', 'group');
    colorOptions.setAttribute('aria-label', 'LUMI and screen pitch colors');
    colorOptions.innerHTML = '<button type="button" data-cxcolormode="interval">Intervals</button><button type="button" data-cxcolormode="note">Note Names</button>';
    if (ledB && ledB.parentNode) ledB.parentNode.insertBefore(colorOptions, tnote || null);
    function paintColorOptions() {
      colorOptions.querySelectorAll('[data-cxcolormode]').forEach(function (button) {
        var selected = button.getAttribute('data-cxcolormode') === colors.mode();
        button.classList.toggle('active', selected); button.setAttribute('aria-pressed', String(selected));
      });
    }
    colorOptions.addEventListener('click', function (event) {
      var button = event.target.closest('[data-cxcolormode]');
      if (button) colors.setMode(button.getAttribute('data-cxcolormode'));
    });
    on('colors', paintColorOptions); paintColorOptions();

    function paintToggles() {
      var m = App.midi, led = !!(m && m.displayEnabled), lk = lockOn();
      if (ledB) { ledB.classList.toggle('active', led); ledB.setAttribute('aria-pressed', String(led)); }
      if (lockB) { lockB.classList.toggle('active', lk); lockB.setAttribute('aria-pressed', String(lk)); }
      if (!tnote) return;
      var sc = Theory.SCALES[curScale()], name = Theory.pcName(curRoot(), Theory.FLAT_KEYS.has(curRoot())) + ' ' + (sc ? sc.name.replace(/\s*\(.*\)$/, '') : '');
      var msg = [];
      if (led && m && m.displayState) msg.push(m.displayState.reason);
      if (lk) msg.push('Only ' + name + ' pitched notes play across tools, playback and MIDI. Drums and recorded/live audio keep their own sound.');
      tnote.textContent = msg.join(' ');
      tnote.hidden = !msg.length;
    }
    if (ledB) {
      ledB.innerHTML = icon('lights', 15) + ' LUMI Display';
      ledB.addEventListener('click', function () { if (App.midi && App.midi.setDisplayEnabled) App.midi.setDisplayEnabled(!App.midi.displayEnabled); paintToggles(); });
    }
    if (lockB) {
      lockB.innerHTML = icon('lock', 15) + ' Scale Lock';
      lockB.addEventListener('click', function () { App.scaleLock.set(!lockOn()); paintToggles(); });
    }
    ['fb:set', 'lights:led', 'lights:display-enabled', 'help:level', 'midi:state', 'scale:lock'].forEach(function (ev) { on(ev, paintToggles); });
    if (cbtn) cbtn.addEventListener('click', paintToggles);
    paintToggles();
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

    // THE transport button: one button, live on every tab, driving whichever
    // clock the current space owns — the metronome in Practice, the loop or
    // the song (on the Timeline) in the Studio. All transports are mutually
    // exclusive via the transport:claim bus event.
    var met = document.getElementById('cx-met');
    if (met) {
      var metRuns = false;
      function anyRunning() {
        var eng = window.DAW && DAW.engine;
        return metRuns || !!(eng && (eng.playing || eng.songPlaying));
      }
      // Practice: metronome glyph + play/stop, so it never reads as the
      // page's own Play (which plays the scale). Studio: plain play/stop —
      // there it runs the loop or the song.
      function paintCx() {
        var runs = anyRunning();
        met.classList.toggle('on', runs);
        met.innerHTML = (space === 'practice' ? icon('metronome', 16) : '') + icon(runs ? 'stop' : 'play', 12);
        met.setAttribute('aria-pressed', String(runs));
        if (!runs) met.classList.remove('tick');
      }
      paintCx();
      met.addEventListener('click', function () {
        var eng = window.DAW && DAW.engine;
        if (space === 'studio' && eng) {
          if (eng.songPlaying) { eng.songStop(); return; }
          if (eng.playing) { eng.stop(); return; }
          if (active === 'arrange') eng.songPlay();
          else if (eng.tracks.length) eng.play();
          else emit('met:toggle', {});
          return;
        }
        emit('met:toggle', {});
      });
      on('met:state', function (d) { metRuns = !!(d && d.running); paintCx(); });
      on('st:state', paintCx);
      on('st:tr', paintCx);
      on('space', paintCx);
      var tickTimer = null;
      function cxTick() {
        met.classList.add('tick');
        if (tickTimer) clearTimeout(tickTimer);
        tickTimer = setTimeout(function () { met.classList.remove('tick'); }, 110);
      }
      on('met:beat', cxTick);
      on('st:step', function (d) { if (d && d.step % 4 === 0) cxTick(); }); // studio beats pulse too
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

  // ---- audio warm-up ----
  // Browsers only start audio after a click/tap/key press, and opening the
  // output device can take 50-200ms. Start it on the FIRST gesture anywhere
  // (a silent one-sample blip), so the first real note doesn't pay for it.
  // MIDI note-ons don't count as a gesture: if the keyboard is played while
  // sound is still locked, say so instead of staying silent.
  function wireAudioWarmup() {
    var hint = null;
    function unlocked() { return !!audioCtx && audioCtx.state === 'running'; }
    function dropHint() { if (hint && hint.parentNode) hint.parentNode.removeChild(hint); hint = null; }
    function warm() {
      try {
        var was = unlocked();
        var c = getAudio(); // resumes a suspended / interrupted context too
        if (was) { dropHint(); return; }
        var b = c.createBuffer(1, 1, c.sampleRate);
        var src = c.createBufferSource();
        src.buffer = b;
        src.connect(c.destination);
        src.start();
      } catch (e) { /* no audio here */ }
      dropHint();
    }
    document.addEventListener('pointerdown', warm, true);
    document.addEventListener('keydown', warm, true);
    on('midi:note', function (d) {
      if (!d || !d.on || d.silent || d.mute || unlocked() || hint) return;
      hint = document.createElement('div');
      hint.id = 'snd-hint';
      hint.setAttribute('role', 'status');
      hint.textContent = 'Your keyboard is connected. Click or tap anywhere to turn on sound — browsers keep audio off until you interact with the page.';
      document.body.appendChild(hint);
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

    // section tab bars (top on wide screens, bottom on phones)
    ['tabbar', 'tabbar-m'].forEach(function (id) {
      var tb = document.getElementById(id);
      if (!tb) return;
      tb.addEventListener('click', function (e) {
        var b = e.target.closest('.tabbar-btn');
        if (!b) return;
        goGroup(b.getAttribute('data-group'));
        b.blur(); // keep keyboard input going to the page
      });
    });
    var subEl = document.getElementById('subnav');
    if (subEl) {
      subEl.addEventListener('click', function (e) {
        var b = e.target.closest('.subtab');
        if (b) { switchTo(b.dataset.page); b.blur(); }
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
      if (sheet) {
        if (e.key === 'Escape') { e.preventDefault(); closeSheet(); return; }
        if (e.key === 'Tab') { // keep focus inside the open sheet
          var card = document.querySelector('#sheet-' + sheet + ' .sheet-card');
          var f = card ? Array.prototype.filter.call(card.querySelectorAll('button, input, select, summary, [tabindex]:not([tabindex="-1"])'),
            function (x) { return !x.disabled && x.offsetParent !== null; }) : [];
          if (f.length) {
            var i = f.indexOf(document.activeElement);
            if (e.shiftKey && i <= 0) { e.preventDefault(); f[f.length - 1].focus(); }
            else if (!e.shiftKey && (i === -1 || i === f.length - 1)) { e.preventDefault(); f[0].focus(); }
          }
          return;
        }
      }
      var t = e.target;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return;
      var mod = modules[sheet || active];
      if (mod && mod.onKey) mod.onKey(e);
    });

    applyTheme(store.get('app.theme', 'dark'));
    wireContextBar();
    wireAudioWarmup();
    wireAutoHideBar();
    wireSheets();
    wireBack();

    var spaceBtn = document.getElementById('space-btn');
    if (spaceBtn) {
      spaceBtn.addEventListener('click', function () {
        setSpace(space === 'studio' ? 'practice' : 'studio');
        this.blur();
      });
    }
    var gearBtn = document.getElementById('settings-btn');
    if (gearBtn) {
      gearBtn.innerHTML = icon('gear', 16);
      gearBtn.addEventListener('click', function () {
        toggleSettings();
        this.blur();
      });
    }

    // theory-first: the app ALWAYS opens in Practice — the Studio is one
    // button away but never the front door (v0.68.0 back-to-basics)
    var startSpace = 'practice';
    space = startSpace;
    document.documentElement.setAttribute('data-space', space);
    if (spaceBtn) {
      spaceBtn.innerHTML = space === 'studio'
        ? icon('left', 14) + ' Practice'
        : icon('right', 14) + ' Studio';
    }
    populateNav();
    var startTab = store.get(tabStoreKey(space), SPACES[space][0]);
    if (SPACES[space].indexOf(startTab) === -1) startTab = SPACES[space][0];
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

  var lockBoundaryKey = JSON.stringify([store.get('fb.root', 9), store.get('fb.scale', 'minorPent')]);
  var lockBoundaryOn = lockOn();
  function checkLockBoundary() {
    var key = JSON.stringify([store.get('fb.root', 9), store.get('fb.scale', 'minorPent')]), onNow = lockOn();
    if (key === lockBoundaryKey && onNow === lockBoundaryOn) return;
    var flush = onNow || lockBoundaryOn;
    lockBoundaryKey = key; lockBoundaryOn = onNow;
    if (flush) { clearPlucks(); emit('scale:boundary', { on: onNow, root: store.get('fb.root', 9), scale: store.get('fb.scale', 'minorPent') }); }
  }
  ['fb:set', 'fb:scale', 'scale:lock'].forEach(function (event) { on(event, checkLockBoundary); });

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
    showBar: showBar,
    help: help,
    colors: colors,
    openSheet: openSheet,
    closeSheet: closeSheet,
    // the clef dropdown (key / scale / tempo): App.ctx(true|false); App.ctx() = is it open
    ctx: function (on) { if (on != null) setCtx(on); return ctxIsOpen(); },
    scaleLock: {
      get on() { return lockOn(); },
      get active() { return lockActive(); }, // global pitched-note scope
      set: function (on) { store.set('scale.lock', !!on); paintLock(); emit('scale:lock', { on: !!on }); },
      allows: lockAllows,
      contains: scaleContains // current root/scale, regardless of app-page gating
    },
    get sheet() { return sheet; },
    wake: wake,
    setTheme: setTheme,
    get themePref() { return store.get('app.theme', 'dark'); },
    switchTo: switchTo,
    boot: boot,
    version: APP_VERSION,
    checkForUpdate: checkForUpdate,
    get active() { return active; },
    get space() { return space; },
    setSpace: setSpace,
    switchTo: switchTo,
    addPage: addPage,
    setVolume: setVolume,
    sampleLead: sampleLead,
    sampleNorm: sampleNorm,
    get volume() { return volPref(); },
    setAccent: setAccent,
    get accent() { var a = store.get('app.accent', 'amber'); return ACCENTS[a] ? a : 'amber'; },
    ACCENTS: ACCENTS
  };
})();
