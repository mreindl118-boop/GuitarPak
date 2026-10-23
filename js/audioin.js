/* soundLAB audio-in — the ONE shared live-input service (App.audioIn).
 * Opens the selected audio input (audio.inId; '' = system default) RAW:
 * echoCancellation / noiseSuppression / autoGainControl off, stereo when the
 * device has it (a synth's L/R stays L/R). On top of that stream:
 *   HEAR INPUT (audio.monitor, default off) — input -> ONE GainNode
 *     (audio.inGain, 0-200 %) -> App.getAudio().destination, which is the
 *     shadowed master gain, so the master volume + soft clipper apply.
 *     Nothing else on the path (LATENCY RULES: no compressor, no extra
 *     buffering). This is how a USB synth — a Yamaha MODX / MONTAGE shows up
 *     on Windows as "Line (MODX)" — or any line input plays through soundLAB.
 *     When off, the gain is NEVER connected to the speakers.
 *   LEVEL METER — an AnalyserNode tap after the gain; level() -> {peak, rms,
 *     clip}. Callers poll it only while a meter is on screen.
 * The stream is open only while something needs it: Hear input on, or a
 * consumer holding it (hold(tag) / release(tag) — the Settings meter while
 * that page shows). A tab switch never closes it.
 * FEEDBACK SAFETY: a device whose label looks like a microphone (or a
 * loopback of the output, "Stereo Mix") is only heard after the user said
 * so: a CHOSEN input with Hear input pressed On (then with a warning), or
 * On pressed again after the card said why it was held. The automatic paths
 * (launch restore, re-plug, return to the app) never route one on their own.
 * A chosen input that is missing is never replaced by the system default
 * for Hear input on its own either: Hear input WAITS for it (no device open)
 * and the card offers "press On again to hear the system default instead".
 * Held = st.held + st.why 'mic' | 'fell' | 'perm'; held with no meter
 * holding the device releases it (no open microphone while nothing sounds).
 * Bus: 'audioin:state' {on, monitor, want, device, label, error, msg, warn,
 * held, why, mic, paused} after every change; 'audioin:device' {id} when the
 * chosen input changes (tone-in re-opens on it). No getUserMedia (the
 * claude.ai viewer, old WebViews, a frame without the microphone permission
 * policy) = supported false + a status message, never an exception at boot.
 * Loaded right after tonein.js.
 */
(function () {
  'use strict';

  // inputs that can feed the speakers back into themselves: microphones (in
  // the names a few Windows / Android languages give them) and loopbacks of
  // the output itself ("Stereo Mix" = a digital feedback loop) ...
  var MIC_RE = /microphone|\bmic\b|mikrofon|micr[oó]fono|microfone|\bmikro|микрофон|マイク|麦克风|마이크|array|webcam|headset|stereo ?mix|what ?u ?hear|loopback|wave ?out ?mix/i;
  // ... but class-compliant instrument interfaces often name their input
  // "Microphone (USB Audio CODEC)" / "Mic/Inst": those are not a mic in the room
  var INSTR_RE = /usb audio codec|irig|\binst\b|instrument|line ?6|helix|stadium|modx|montage|yamaha|steinberg|focusrite|scarlett|behringer|\bumc ?\d|\buca ?\d|audient|presonus|motu|katana/i;

  var st = { on: false, monitor: false, device: '', label: '', error: '', msg: '', warn: '', held: false, why: '', mic: false, fell: false, paused: false };
  var stream = null, src = null, gain = null, an = null, buf = null;
  var monOn = false;      // gain -> master connected right now
  var req = 0;            // open token: a stale getUserMedia resolve is dropped
  var opening = null;     // the open in flight
  var holds = {};         // consumers besides Hear input that need the stream
  var consent = false;    // On pressed for this open: a CHOSEN mic-like input may sound (with the warning)
  var ack = false;        // On pressed again while held: allowed whatever it is (a default mic, the fallback)
  var fellListed = false; // the chosen id was listed when the open fell back (re-open only when it newly appears)
  var listErr = '';       // why the last devices(true) could not read the names
  var lastList = [];      // last enumerated audio inputs
  var prevIds = null;     // the input ids at the previous devicechange
  var hint = null;        // the "tap to start sound" note while the context is locked

  function md() { return navigator.mediaDevices || null; }
  // a frame without the microphone permission policy refuses every capture
  function policyBlocks() {
    try {
      var fp = document.permissionsPolicy || document.featurePolicy;
      return !!(fp && typeof fp.allowsFeature === 'function' && !fp.allowsFeature('microphone'));
    } catch (e) { return false; }
  }
  function supported() { var m = md(); return !!(m && typeof m.getUserMedia === 'function') && !policyBlocks(); }
  function wantId() { var v = App.store.get('audio.inId', ''); return typeof v === 'string' ? v : ''; }
  function wantMonitor() { return App.store.get('audio.monitor', false) === true; }
  function gainPct() {
    var v = parseInt(App.store.get('audio.inGain', 100), 10);
    return v >= 0 && v <= 200 ? v : 100;
  }
  function holding() { return Object.keys(holds).length > 0; }
  function exactHolding() { return Object.keys(holds).some(function (tag) { return holds[tag] && holds[tag].exact; }); }
  function needed() { return wantMonitor() || holding(); }
  function isMic(label) { return !!label && MIC_RE.test(label) && !INSTR_RE.test(label); }
  function chosenName() {
    var l = App.store.get('audio.inLabel', '');
    return l ? '“' + l + '”' : 'Your chosen input';
  }

  function snapshot() {
    return {
      on: st.on, monitor: st.monitor, want: wantMonitor(), device: st.device, label: st.label,
      error: st.error, msg: st.msg, warn: st.warn, held: st.held, why: st.why, mic: st.mic,
      paused: st.paused, gain: gainPct()
    };
  }
  function emit() { App.emit('audioin:state', snapshot()); }

  function stopTracks(s) {
    try { s.getTracks().forEach(function (t) { t.onended = null; t.stop(); }); } catch (e) { /* already gone */ }
  }

  // getUserMedia errors -> what the user can do about it
  function inputError(err, listing) {
    var n = (err && err.name) || 'error';
    if (n === 'NotAllowedError' || n === 'SecurityError') {
      return 'Input permission was declined' + (listing ? ' — device names stay hidden' : '') +
        '. Allow the microphone / audio input for soundLAB, then try again.';
    }
    if (n === 'NotFoundError' || n === 'OverconstrainedError') {
      return 'No audio input found — connect or switch on your interface (a Yamaha MODX / MONTAGE needs the Yamaha Steinberg USB driver on Windows).';
    }
    if (n === 'NotReadableError' || n === 'AbortError') {
      return 'The input exists but could not be opened (' + n + ') — another app may be holding it.';
    }
    return 'Audio input unavailable (' + n + ').';
  }

  // ---- device list ----
  // ask=true asks for input permission first when the names are still blank
  // (browsers only reveal labels once an input was granted).
  function enumerate() {
    var m = md();
    if (!m || typeof m.enumerateDevices !== 'function') return Promise.resolve([]);
    return Promise.resolve().then(function () { return m.enumerateDevices(); }).then(function (all) {
      lastList = (all || []).filter(function (d) { return d.kind === 'audioinput'; }).map(function (d) {
        return { deviceId: d.deviceId, groupId: d.groupId, kind: d.kind, label: d.label || '' };
      });
      return lastList;
    }).catch(function () { return []; });
  }

  function devices(ask) {
    return enumerate().then(function (l) {
      var named = l.some(function (d) { return d.label; });
      if (named) listErr = '';
      if (!ask || named || stream || !supported()) return l;
      return md().getUserMedia({ audio: true }).then(function (s) {
        stopTracks(s);
        listErr = '';
        return enumerate();
      }, function (err) {
        listErr = inputError(err, true);
        emit();
        return l;
      });
    });
  }

  function listedLabel(id) {
    for (var i = 0; i < lastList.length; i++) if (lastList[i].deviceId === id) return lastList[i].label;
    return '';
  }
  function isListed(id) { return !!id && lastList.some(function (d) { return d.deviceId === id; }); }

  // ---- "tap to start sound" while the browser keeps the context locked ----
  function dropHint() { if (hint && hint.parentNode) hint.parentNode.removeChild(hint); hint = null; }
  function watchCtx() {
    var ctx = gain && gain.context;
    if (!ctx) return;
    st.paused = ctx.state !== 'running';
    if (!st.paused) { dropHint(); return; }
    if (!watchCtx.ctx) {
      watchCtx.ctx = ctx;
      ctx.addEventListener('statechange', function onState() {
        if (ctx.state !== 'running') return;
        ctx.removeEventListener('statechange', onState);
        watchCtx.ctx = null;
        dropHint();
        if (st.paused) { st.paused = false; emit(); }
      });
    }
    if (!hint && !document.getElementById('snd-hint') && document.body) {
      hint = document.createElement('div');
      hint.id = 'snd-hint';
      hint.setAttribute('role', 'status');
      hint.textContent = 'Hear input is on. Click or tap anywhere to turn on sound — browsers keep audio off until you interact with the page.';
      document.body.appendChild(hint);
    }
  }

  // ---- the monitor route ----
  function route(on) {
    if (!gain) { monOn = false; return; }
    var dest;
    try { dest = App.getAudio().destination; } catch (e) { return; }
    if (on && !monOn) {
      gain.connect(dest);
      monOn = true;
    } else if (!on && monOn) {
      try { gain.disconnect(dest); } catch (e) {
        try { gain.disconnect(); if (an) gain.connect(an); } catch (e2) { /* graph gone */ }
      }
      monOn = false;
    }
  }

  // decide whether Hear input may sound right now (see FEEDBACK SAFETY);
  // owns st.msg / warn / held while a stream is open
  function applyMonitor() {
    var want = wantMonitor() && st.on;
    var chosen = !!wantId() && !st.fell;
    var lab = '“' + (st.label || 'this input') + '”';
    st.warn = '';
    st.held = false;
    st.why = '';
    st.msg = '';
    if (want && st.fell && !ack) {
      want = false;
      st.held = true;
      st.why = 'fell';
      st.msg = chosenName() + ' is not connected, so Hear input waits for it (the meter shows the system default, ' + lab + '). ' +
        'Press On again to hear the system default instead.';
    } else if (want && st.mic && !ack && !(consent && chosen)) {
      want = false;
      st.held = true;
      st.why = 'mic';
      st.msg = lab + ' looks like a microphone, so Hear input is paused (it could howl through the speakers). ' +
        'Pick your instrument as Input, or press On again to allow it.';
    } else if (want && st.fell) {
      st.msg = 'Hearing the system default, ' + lab + ' — ' + chosenName().replace(/^Your/, 'your') + ' is not connected.';
    } else if (st.fell) {
      st.msg = 'The chosen input is not connected — the meter shows the system default until it comes back.';
    }
    if (want && st.mic) {
      st.warn = 'This input looks like a microphone: through speakers it can feed back (howl). Use headphones, or turn Hear input off.';
    }
    route(want);
    st.monitor = want;
    if (want) watchCtx(); else { st.paused = false; dropHint(); }
  }

  function relabel() {
    var tr = stream && stream.getAudioTracks()[0];
    var own = (tr && tr.label) || '';
    var dflt = st.fell || !st.device || st.device === 'default' || st.device === 'communications';
    var listed = listedLabel(st.device) || (dflt ? '' : listedLabel(wantId()));
    // the listed "default" entry names the CURRENT OS default, which may not
    // be what this track captures: there the track's own label wins
    st.label = dflt ? (own || listed) : (listed || own);
    st.mic = isMic(listed) || isMic(own);
  }

  // held with no meter holding the device: let it go (no open microphone
  // while nothing is heard), keep the reason on screen
  function park() {
    var keep = { held: st.held, why: st.why, msg: st.msg, label: st.label, mic: st.mic };
    close();
    st.held = keep.held; st.why = keep.why; st.msg = keep.msg; st.label = keep.label; st.mic = keep.mic;
  }
  function settle() { if (stream && st.held && !holding()) park(); }

  function raw(id) {
    var a = { echoCancellation: false, noiseSuppression: false, autoGainControl: false, channelCount: { ideal: 2 } };
    if (id) a.deviceId = { exact: id };
    return { audio: a };
  }

  function open() {
    if (stream) return Promise.resolve(snapshot());
    if (opening) return opening;
    if (!supported()) {
      st.error = 'Audio input is not available here (this browser or viewer does not allow it).';
      emit();
      return Promise.resolve(snapshot());
    }
    var token = ++req, id = wantId();
    // the system default stands in for a missing chosen input only for a
    // meter, or after the user pressed On again (ack) — never by itself
    var mayFall = !exactHolding() && (holding() || ack);
    // raw first; some WebViews refuse the processing flags, so retry plain
    var tries = id
      ? [{ c: raw(id) }, { c: { audio: { deviceId: { exact: id } } } }]
      : [{ c: raw('') }, { c: { audio: true } }];
    if (id && mayFall) tries.push({ c: raw(''), fell: true }, { c: { audio: true }, fell: true });
    st.error = '';
    st.msg = '';
    st.held = false;
    st.why = '';
    function attempt(i) {
      return md().getUserMedia(tries[i].c).then(function (s) { return { s: s, fell: !!tries[i].fell }; }, function (err) {
        var n = err && err.name;
        // permission, or a device that is there but busy: no point trying more
        // (a busy chosen input must NOT turn into the default mic)
        if (n === 'NotAllowedError' || n === 'SecurityError' || n === 'NotReadableError' || n === 'AbortError' ||
            i + 1 >= tries.length) throw err;
        return attempt(i + 1);
      });
    }
    var p = attempt(0).then(function (r) {
      if (token !== req || !needed()) { stopTracks(r.s); return snapshot(); }
      // build the whole graph first: module state only changes once it all
      // exists (a throw here must not leave a live capture with no graph)
      var n = {};
      try {
        var ctx = App.getAudio();
        n.src = ctx.createMediaStreamSource(r.s);
        n.gain = ctx.createGain();
        n.gain.gain.value = gainPct() / 100;
        n.an = ctx.createAnalyser();
        n.an.fftSize = 1024;
        n.src.connect(n.gain);
        n.gain.connect(n.an); // the meter tap — the speakers only via applyMonitor
      } catch (e) {
        try { if (n.src) n.src.disconnect(); if (n.gain) n.gain.disconnect(); } catch (e2) { /* partial graph */ }
        stopTracks(r.s);
        st.error = 'The input could not be connected to the audio engine (' + ((e && (e.name || e.message)) || 'error') + ').';
        return snapshot();
      }
      stream = r.s;
      src = n.src;
      gain = n.gain;
      an = n.an;
      buf = new Float32Array(an.fftSize);
      monOn = false;
      st.on = true;
      st.fell = r.fell;
      var tr = stream.getAudioTracks()[0];
      var set = (tr && tr.getSettings) ? tr.getSettings() : {};
      st.device = set.deviceId || (r.fell ? '' : id);
      if (tr) {
        tr.onended = function () {
          if (stream !== r.s) return;
          close();
          st.msg = 'The input was disconnected.' + (wantMonitor() ? ' Hear input comes back on when it returns.' : '');
          emit();
        };
      }
      // the grant made the device names readable: label + mic check
      return enumerate().then(function () {
        if (stream !== r.s) return snapshot();
        fellListed = st.fell && isListed(id);
        relabel();
        if (id && !st.fell && st.label) App.store.set('audio.inLabel', st.label);
        applyMonitor();
        settle();
        return snapshot();
      });
    }).catch(function (err) {
      if (token !== req) return snapshot();
      var n = (err && err.name) || 'error';
      if (id && !mayFall && (n === 'NotFoundError' || n === 'OverconstrainedError') && wantMonitor()) {
        // the chosen input is missing: Hear input waits for it, nothing open
        st.held = true;
        st.why = 'fell';
        st.msg = chosenName() + ' is not connected — Hear input comes back on when it returns. ' +
          'Press On again to hear the system default instead.';
        return snapshot();
      }
      st.error = inputError(err, false);
      // a declined prompt switches Hear input off: no new prompt at every launch
      if ((n === 'NotAllowedError' || n === 'SecurityError') && wantMonitor()) {
        App.store.set('audio.monitor', false);
        ack = false;
      }
      return snapshot();
    }).then(function () {
      if (token === req) opening = null;
      emit();
      return snapshot();
    });
    opening = p;
    return p;
  }

  function close() {
    req++; // an open still in flight drops its stream
    opening = null;
    route(false);
    if (src) { try { src.disconnect(); } catch (e) { /* gone */ } }
    if (gain) { try { gain.disconnect(); } catch (e) { /* gone */ } }
    if (stream) stopTracks(stream);
    stream = src = gain = an = buf = null;
    monOn = false;
    consent = false;
    ack = false;
    fellListed = false;
    st.on = false;
    st.monitor = false;
    st.device = '';
    st.held = false;
    st.why = '';
    st.warn = '';
    st.fell = false;
    st.paused = false;
    dropHint();
  }

  // ---- public controls ----
  function hold(tag, options) {
    holds[tag || 'api'] = options && options.exact ? { exact: true } : true;
    return open();
  }

  // Analysis consumers share this source; they connect/disconnect only their
  // own analyser edge. Ownership and track lifetime remain in this service.
  function tap(tag) {
    if (!holds[tag || 'api'] || !stream || !src || !st.on) return null;
    return { source: src, context: App.getAudio(), deviceId: st.device };
  }

  function release(tag) {
    delete holds[tag || 'api'];
    if (stream || opening) {
      if (!needed()) { close(); emit(); }
      else if (stream && st.held && !holding()) { park(); emit(); }
    }
    return snapshot();
  }

  function setMonitor(on) {
    on = !!on;
    App.store.set('audio.monitor', on);
    if (on) {
      consent = true;
      // On pressed again after the card said why it was held = allow it
      if (st.held && (st.why === 'mic' || st.why === 'fell')) ack = true;
      if (!stream) {
        st.held = false;
        st.why = '';
        return open();
      }
      applyMonitor();
      emit();
      return Promise.resolve(snapshot());
    }
    ack = false;
    consent = false;
    route(false);
    st.monitor = false;
    st.warn = '';
    st.held = false;
    st.why = '';
    st.paused = false;
    dropHint();
    if (!needed()) { close(); st.msg = ''; } else applyMonitor();
    emit();
    return Promise.resolve(snapshot());
  }

  function setGain(pct) {
    var v = Math.max(0, Math.min(200, Math.round(Number(pct) || 0)));
    App.store.set('audio.inGain', v);
    if (gain) {
      try {
        var t = gain.context.currentTime;
        gain.gain.cancelScheduledValues(t);
        gain.gain.setTargetAtTime(v / 100, t, 0.015); // smooth, no zipper clicks
      } catch (e) { gain.gain.value = v / 100; }
    }
    emit();
    return v;
  }

  function setDevice(id) {
    id = typeof id === 'string' ? id : '';
    var changed = id !== wantId();
    App.store.set('audio.inId', id);
    if (!changed) return Promise.resolve(snapshot());
    App.store.set('audio.inLabel', listedLabel(id));
    App.emit('audioin:device', { id: id });
    close();
    st.msg = '';
    st.error = '';
    if (needed()) return open();
    emit();
    return Promise.resolve(snapshot());
  }

  function start() { return hold('api'); }

  // a hard off switch: every hold dropped, Hear input off, device released
  function stop() {
    holds = {};
    App.store.set('audio.monitor', false);
    close();
    st.msg = '';
    emit();
    return snapshot();
  }

  function level() {
    if (!an || !buf) return { peak: 0, rms: 0, clip: false };
    an.getFloatTimeDomainData(buf);
    var pk = 0, sum = 0;
    for (var i = 0; i < buf.length; i++) {
      var v = buf[i], a = v < 0 ? -v : v;
      if (a > pk) pk = a;
      sum += v * v;
    }
    return { peak: Math.min(1, pk), rms: Math.min(1, Math.sqrt(sum / buf.length)), clip: pk >= 0.99 };
  }

  // ---- plug / unplug / coming back to the app ----
  // re-open when something needs the input and it can be opened as wanted:
  // a parked microphone or a permission hold waits for the user; a missing
  // chosen input waits until it is listed again
  function reopen(list, newly) {
    if (stream || opening || !needed()) return;
    if (st.held && st.why !== 'fell') return;
    // the last open failed (busy, permission): only a chosen input that has
    // just appeared is worth another try — not every unrelated devicechange
    if (st.error && !newly) return;
    var want = wantId();
    if (want && list.length && !list.some(function (d) { return d.deviceId === want; }) && !holding()) return;
    open();
  }

  function onDeviceChange() {
    enumerate().then(function (list) {
      var ids = list.map(function (d) { return d.deviceId; });
      var want = wantId(), listed = !!want && ids.indexOf(want) !== -1;
      var newly = listed && !!prevIds && prevIds.indexOf(want) === -1;
      prevIds = ids;
      if (stream) {
        var tr = stream.getAudioTracks()[0];
        var gone = !tr || tr.readyState === 'ended' ||
          (st.device && st.device !== 'default' && st.device !== 'communications' && list.length > 0 && ids.indexOf(st.device) === -1);
        if (gone) {
          close();
          st.msg = 'The input was unplugged.' + (wantMonitor() ? ' Hear input comes back on when it returns.' : '');
          emit();
          return;
        }
        // running on the default because the chosen one was missing: it is
        // back (newly listed — not on every unrelated devicechange)
        if (st.fell && listed && !fellListed) { close(); open(); return; }
        fellListed = st.fell && listed;
        relabel();       // the default may now be another device...
        applyMonitor();  // ...so the microphone check runs again
        settle();
        emit();
        return;
      }
      reopen(list, newly);
    });
  }

  try {
    var m0 = md();
    if (m0 && typeof m0.addEventListener === 'function') m0.addEventListener('devicechange', onDeviceChange);
  } catch (e) { /* no device events here */ }

  // App hidden: Hear input KEEPS sounding on purpose — it is a passthrough,
  // like a hardware mixer: a synth played into soundLAB must not cut out when
  // another window takes focus or the screen dims. Anything not being heard
  // (a meter-only tap, a held input) releases the device instead and re-opens
  // on return.
  document.addEventListener('visibilitychange', function () {
    if (document.hidden) {
      if ((stream || opening) && !st.monitor) {
        if (stream && st.held) park(); else close();
        emit();
      }
    } else if (needed() && !stream && !opening) {
      enumerate().then(reopen);
    }
  });

  // Hear input left on last time: restore it — only with the permission
  // already granted (no prompt at launch; a blocked one switches it off), and
  // a microphone / missing input still holds (see FEEDBACK SAFETY)
  function permState() {
    try {
      if (navigator.permissions && typeof navigator.permissions.query === 'function') {
        return navigator.permissions.query({ name: 'microphone' }).then(function (p) { return p.state; }, function () { return 'unknown'; });
      }
    } catch (e) { /* no permissions API */ }
    return Promise.resolve('unknown');
  }
  setTimeout(function () {
    try {
      if (!wantMonitor() || stream || opening) return;
      if (!supported()) { st.error = 'Audio input is not available here (this browser or viewer does not allow it).'; emit(); return; }
      permState().then(function (s) {
        if (!wantMonitor() || stream || opening) return;
        if (s === 'denied') {
          App.store.set('audio.monitor', false);
          st.msg = 'Hear input was switched off: the audio-input permission is blocked for soundLAB.';
          emit();
          return;
        }
        // the Android app grants the input natively (no web prompt), so its
        // WebView's 'prompt' is no reason to wait
        if (s === 'prompt' && !window.GuitarLabHost) {
          st.held = true;
          st.why = 'perm';
          st.msg = 'Hear input is on — press On to start it (the browser asks for the audio input first).';
          emit();
          return;
        }
        open();
      });
    } catch (e) { /* fail soft */ }
  }, 500);

  App.audioIn = {
    start: start,
    stop: stop,
    hold: hold,
    tap: tap,
    release: release,
    setDevice: setDevice,
    setMonitor: setMonitor,
    setGain: setGain,
    level: level,
    devices: devices,
    isMic: isMic,
    get supported() { return supported(); },
    get state() { return snapshot(); },
    get gain() { return gainPct(); },
    get monitor() { return wantMonitor(); },
    get listError() { return listErr; },
    get holding() { return holding(); },
    // test hook: the live graph
    _t: function () {
      return { stream: stream, src: src, gain: gain, an: an, monOn: monOn, holds: Object.keys(holds), opening: !!opening };
    }
  };
})();
