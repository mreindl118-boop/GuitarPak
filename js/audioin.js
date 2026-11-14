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
 * Held = st.held + st.why 'mic' | 'fell' | 'perm' | 'other'; held with no
 * meter holding the device releases it (no open microphone while nothing
 * sounds).
 * ONE WINDOW PLAYS HEAR INPUT (2.0): soundLAB (index.html) and soundLAB Gear
 * (gear.html) both load this file and read the same audio.monitor. Only the
 * document that holds the Web Lock 'soundlab-hear-input' connects the input
 * to the speakers; another one holds with why 'other' until On or Off is
 * pressed in it (the press takes the lock) or the owner closes. The rule is
 * spelled out above the lock code, near the end of this file.
 * App.audioIn.mountSwitch(el) = Off / On + a status line for a page without
 * the Settings card (Gear's Hub header).
 * THE CHOSEN OUTPUT (audio.outId) is applied to the shared AudioContext here
 * (applySink), for both apps: soundLAB's Settings card has the picker and
 * calls it from its device list; soundLAB Gear has no Settings page, so this
 * file looks at the list itself there (sinkWatch) — Gear's metronome, the
 * Hub's Player and Hear input come out of the device chosen in soundLAB.
 * Bus: 'audioin:state' {on, monitor, want, device, label, error, msg, warn,
 * held, why, mic, paused} after every change (also when audio.monitor was
 * changed in another window); 'audioin:device' {id} when the
 * chosen input changes (tone-in re-opens on it). No getUserMedia (the
 * claude.ai viewer, old WebViews, a frame without the microphone permission
 * policy) = supported false + a status message, never an exception at boot.
 * Loaded right after tonein.js (soundLAB) / midirules.js (soundLAB Gear).
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
  // ONE WINDOW PLAYS HEAR INPUT (the rule is above askLock, near the end)
  var LOCK = 'soundlab-hear-input';
  var OTHER = 'Your other soundLAB window has Hear input. Press On to hear it here instead.';
  var owner = false;      // this document has the lock (or there are no Web Locks here): only then is the input routed
  var lockN = 0;          // lock requests made so far (each gets a number)
  var mine = 0;           // the granted request this document holds (0 = none)
  var waiting = 0;        // a plain request of this document that waits in the queue (0 = none)
  var taking = null;      // On / Off pressed without the lock: the {steal: true} request in flight, {p}
  var launched = false;   // the launch restore has had its turn (500 ms after load)
  var GEAR = App.app === 'gear'; // soundLAB Gear (js/app.js APPS): no Settings card there

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
    if (on && !owner) on = false; // ONE WINDOW PLAYS HEAR INPUT: never from a window without the lock
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
    if (want && !owner) {
      // ONE WINDOW PLAYS HEAR INPUT: another window has it (settle() lets the
      // device go unless a meter holds it)
      want = false;
      st.held = true;
      st.why = 'other';
      st.msg = OTHER;
    } else if (want && st.fell && !ack) {
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
      // the grant made the device names readable: label + mic check (and
      // in Gear the chosen output, whose id was hidden until now)
      if (GEAR) sinkWatch();
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
      // a declined prompt switches Hear input off: no new prompt at every
      // launch. Only in the window that has Hear input (owner): the input
      // declined for a meter in another window must not switch off what
      // that one is playing — it would go on sounding with every switch at Off
      if ((n === 'NotAllowedError' || n === 'SecurityError') && wantMonitor() && owner) {
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

  // Hear input switched on / off in THIS window (it has the lock)
  function monitorOn() {
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
  function monitorOff() {
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

  function setMonitor(on) {
    on = !!on;
    App.store.set('audio.monitor', on);
    if (owner && !taking) return on ? monitorOn() : monitorOff();
    // another window has Hear input: the press brings it to this one first
    // (ONE WINDOW PLAYS HEAR INPUT), then does what it always did. Presses
    // made while the lock is on its way follow in the order they were made
    if (st.why === 'other') { st.held = false; st.why = ''; st.msg = ''; } // "the other window has it" ends with this press
    return takeLock().then(function () { return on ? monitorOn() : monitorOff(); });
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
    if (otherWaits()) return Promise.resolve(snapshot()); // not opened for Hear input alone: another window has it
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
    if (!owner) takeLock(); // Hear input may be sounding in another window: taking the lock stops it there (lostLock)
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
  // chosen input waits until it is listed again; Hear input that another
  // window has opens nothing (a meter still gets its device, never routed)
  function reopen(list, newly) {
    if (stream || opening || !needed()) return;
    if (otherWaits()) return;
    if (st.held && st.why !== 'fell' && !(st.why === 'other' && holding())) return;
    // the last open failed (busy, permission): only a chosen input that has
    // just appeared is worth another try — not every unrelated devicechange
    if (st.error && !newly) return;
    var want = wantId();
    if (want && list.length && !list.some(function (d) { return d.deviceId === want; }) && !holding()) return;
    open();
  }

  function onDeviceChange() {
    if (GEAR) sinkWatch(); // the chosen output may be back (soundLAB: the Settings card does this)
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
      if (otherWaits()) return; // another window has Hear input: nothing to open here
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
  // (also run when this window gets the Hear-input lock from the queue: the
  // window that had it closed — see tookOver)
  function restore() {
    try {
      if (!wantMonitor() || stream || opening) return;
      if (!supported()) { st.error = 'Audio input is not available here (this browser or viewer does not allow it).'; emit(); return; }
      if (otherWaits()) return; // another window has Hear input: held, nothing opened
      permState().then(function (s) {
        if (!wantMonitor() || stream || opening) return;
        if (otherWaits()) return; // the lock went while the permission was read
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
  }
  setTimeout(function () { launched = true; restore(); }, 500);

  // ---- ONE WINDOW PLAYS HEAR INPUT (soundLAB + soundLAB Gear side by side) ----
  // audio.monitor is ONE stored switch that every document reads: each would
  // restore it at launch and keep it sounding while hidden, so a synth on USB
  // audio would play twice. The rule: only the document that holds the Web
  // Lock LOCK (exclusive) connects the input to the speakers.
  //  - every document asks for it at load (a plain request) and keeps it for
  //    its lifetime once it has it, Hear input on or off. One window open =
  //    it has the lock a few milliseconds after load (one round trip to the
  //    browser; 3-50 ms measured), long before the launch restore at 500 ms,
  //    and from then on every path in this file is the same as ever. A press
  //    or a restore that comes before the answer ends in the same place.
  //  - not the owner: Hear input is held (why 'other') and nothing is opened
  //    for it alone — route(), applyMonitor(), reopen(), the return to
  //    visible, the launch restore, setDevice(). A meter hold still opens
  //    the device; it is never routed.
  //  - On or Off pressed in a window that is not the owner takes the lock
  //    first ({steal: true}): the press makes THAT window the one that plays.
  //  - the window it was taken from reads audio.monitor again: still on = it
  //    stops, says where Hear input went and waits in the queue; off = it
  //    switches off too. That is how Off in one window stops the other: the
  //    lock carries the news, the stored switch is only read.
  //  - a browser may hand a window the lock news BEFORE the value the other
  //    window just stored (seen in Chromium with two tabs), and a
  //    press in the window that has the lock sends no lock news at all. So
  //    one 'storage' listener keeps what a window SAYS in step (storeChanged):
  //    an 'other' hold exists exactly while the switch is on and another
  //    window has the lock. It never routes, opens or steals anything.
  //  - the owner closes: the next window in the queue gets the lock and, if
  //    audio.monitor is on, restores it like a launch (permission check
  //    first; a microphone waits for a press).
  //  - no Web Locks, or the request is refused (the claude.ai viewer frame,
  //    old WebViews): owner from the start, everything as before.
  // Nothing is stored; a window that closes frees its lock.
  function lockApi() { try { var l = navigator.locks; return l && typeof l.request === 'function' ? l : null; } catch (e) { return null; } }

  function holdOther() {
    if (st.held && st.why === 'other' && st.msg === OTHER) return false;
    st.held = true;
    st.why = 'other';
    st.msg = OTHER;
    return true;
  }
  // Hear input is all that wants the device and another window has it: say
  // so instead of opening it
  function otherWaits() {
    if (owner || holding() || !wantMonitor()) return false;
    if (holdOther()) emit();
    return true;
  }

  // one request for the lock. got() runs once this document has it — or once
  // it is known that there are no Web Locks here (then every window plays,
  // as before). The promise handed to the lock never settles, so the lock
  // stays until the document closes or another window takes it; the request
  // then rejects (AbortError) and lostLock() runs
  function askLock(steal, got) {
    var api = lockApi(), id = ++lockN, had = false, p = null;
    function have() {
      had = true;
      mine = id;
      if (waiting === id) waiting = 0;
      owner = true;
      try { got(); } catch (e) { console.error('audioin', e); }
    }
    if (!api) { have(); return; }
    if (!steal) waiting = id;
    try {
      p = api.request(LOCK, steal ? { steal: true } : { mode: 'exclusive' }, function () {
        have();
        return new Promise(function () { /* kept for the lifetime of this document */ });
      });
    } catch (e) { p = null; }
    if (!p || typeof p.then !== 'function') { have(); return; }
    p.then(null, function () {
      if (!had) { have(); return; } // refused (a frame that may not use locks): as before
      if (mine !== id) return;      // this window's own newer request has it
      mine = 0;
      if (taking) return;           // ...or is about to (On / Off pressed here): its grant follows
      owner = false;
      lostLock();
    });
  }

  // On / Off pressed in a window without the lock: take it. One request at a
  // time; every press made while it is out waits for the same answer
  function takeLock() {
    if (taking) return taking.p;
    var t = taking = { p: null };
    t.p = new Promise(function (done) {
      askLock(true, function () { if (taking === t) taking = null; done(); });
    });
    return t.p;
  }

  // the lock came from the queue: at load (the launch restore follows on its
  // own timer), or later because the window that had it closed
  function tookOver() {
    var want = wantMonitor(), was = st.why === 'other';
    if (was && (!stream || !want)) { st.held = false; st.why = ''; st.msg = ''; } // no other window has it any more
    if (want && stream) { applyMonitor(); settle(); }  // open for a meter: only the route was missing
    else if (want && launched && !opening) restore();  // like a launch: the permission check first
    if (was || (want && stream)) emit();
  }

  // another window pressed On or Off and has the lock now
  function lostLock() {
    // getting it back from the queue is an automatic path: a microphone
    // waits for a press again (FEEDBACK SAFETY)
    consent = false;
    ack = false;
    if (wantMonitor()) {
      // On was pressed there: stop here and say where Hear input went
      if (stream) { applyMonitor(); settle(); } else holdOther();
      emit();
    } else {
      monitorOff(); // Off was pressed there: off here too (the store already says so)
    }
    // back into the queue: this window plays again when that one closes
    if (!waiting) askLock(false, tookOver);
  }

  // audio.monitor changed in another window (key null = the store was
  // cleared). Matched by suffix, so the storage prefix may change
  function storeChanged(e) {
    var k = e ? e.key : null;
    if (k != null && !/audio\.monitor$/.test(k)) return;
    if (launched && !owner && !taking) {
      if (stream) { applyMonitor(); settle(); } // open for a meter: the hold follows the switch
      else if (!wantMonitor()) { if (st.why === 'other') { st.held = false; st.why = ''; st.msg = ''; } }
      else if (!opening && !holding()) holdOther();
    }
    emit(); // the views read the switch again (the Settings card, the Hub's switch)
  }
  try { window.addEventListener('storage', storeChanged); } catch (e) { /* no window events here */ }

  askLock(false, tookOver);

  // ---- a Hear input switch for a page without the Settings card ----
  // (soundLAB Gear's Hub header, #mh-hearin.) Off / On + one status line;
  // the input, the level and the meter stay in soundLAB › Settings. Safe to
  // call again, on the same element or on the new one after the page
  // re-rendered: one bus listener for all of them, one click listener each.
  var switches = [], switchWired = false;
  function paintSwitch(el) {
    var s = snapshot(), held = s.want && s.held;
    var bs = el.querySelectorAll('button[data-hear]');
    for (var i = 0; i < bs.length; i++) {
      var act = (bs[i].getAttribute('data-hear') === 'on') === s.want;
      bs[i].classList.toggle('active', act && !held);
      bs[i].classList.toggle('held', act && held); // On, but paused: not lit (the Settings card's class)
      bs[i].setAttribute('aria-pressed', String(act));
      bs[i].title = act && held ? 'On, but paused. The note beside it says why.' : '';
    }
    var line = el.querySelector('[data-hear-status]');
    if (!line) return;
    var txt = s.error || s.msg;
    if (!txt) {
      if (s.monitor) {
        txt = s.paused
          ? 'Tap anywhere to turn on sound. The browser keeps audio off until you touch the page.'
          : 'Hearing “' + (s.label || 'the input') + '” through this computer.';
      } else {
        txt = s.want ? 'Starting…' : 'Off.';
      }
    }
    line.textContent = txt + (s.warn ? ' ' + s.warn : '');
  }
  function paintSwitches() { switches.forEach(paintSwitch); }
  function mountSwitch(el) {
    if (!el) return null;
    // the page re-rendered: forget the elements that are gone
    switches = switches.filter(function (x) { return x !== el && document.body && document.body.contains(x); });
    switches.push(el);
    if (!el.querySelector('[data-hear-status]')) {
      el.innerHTML =
        '<span class="ctl-label">Hear input</span> ' +
        '<span class="seg" role="group" aria-label="Hear input">' +
          '<button type="button" data-hear="off">Off</button><button type="button" data-hear="on">On</button>' +
        '</span> ' +
        '<span class="muted small"><span data-hear-status aria-live="polite"></span> ' +
          'Input, level and meter: <a href="index.html#settings" style="color:inherit">soundLAB › Settings</a>.</span>';
    }
    if (!el._hearSwitch) {
      el._hearSwitch = true;
      el.addEventListener('click', function (e) {
        var b = e.target && e.target.closest ? e.target.closest('button[data-hear]') : null;
        if (!b || !el.contains(b)) return;
        setMonitor(b.getAttribute('data-hear') === 'on').then(paintSwitches, paintSwitches);
        paintSwitch(el);
      });
    }
    if (!switchWired) {
      switchWired = true;
      App.on('audioin:state', paintSwitches); // also sent when the switch changed in the other window (storeChanged)
    }
    paintSwitch(el);
    return el;
  }

  // ---- the chosen OUTPUT (audio.outId) ----
  // Applied to the shared context at the first gesture after launch (no
  // AudioContext before one) and again when the device comes back after an
  // unplug (force: the context fell back). refused() = the browser said no.
  // Nothing here asks for a permission: an output the browser does not list
  // is simply not applied.
  var sinkWait = false;
  function applySink(force, refused) {
    var id = App.store.get('audio.outId', '');
    if (!id) return;
    function go() {
      try {
        var ctx = App.getAudio();
        if (typeof ctx.setSinkId !== 'function' || (!force && ctx.sinkId === id)) return;
        ctx.setSinkId(id).catch(function () { if (refused) refused(); });
      } catch (e) { /* no audio here */ }
    }
    var ua = navigator.userActivation;
    if (!ua || ua.hasBeenActive) { go(); return; }
    if (sinkWait) return;
    sinkWait = true;
    function once() {
      document.removeEventListener('pointerdown', once, true);
      document.removeEventListener('keydown', once, true);
      sinkWait = false;
      go();
    }
    document.addEventListener('pointerdown', once, true);
    document.addEventListener('keydown', once, true);
  }
  // soundLAB Gear: nobody else looks at the output there (soundLAB's Settings
  // card calls applySink from its own device list). At load, on every device
  // change and after an input was granted (the ids are readable from then)
  var outGone = false; // the chosen output was missing at the last look
  function sinkWatch() {
    var id = App.store.get('audio.outId', ''), m = md();
    if (!id || !m || typeof m.enumerateDevices !== 'function') return;
    Promise.resolve().then(function () { return m.enumerateDevices(); }).then(function (all) {
      var there = (all || []).some(function (d) { return d.kind === 'audiooutput' && d.deviceId === id; });
      if (there) applySink(outGone);
      outGone = !there;
    }).catch(function () { /* no device list here */ });
  }
  if (GEAR) sinkWatch();

  App.audioIn = {
    start: start,
    stop: stop,
    hold: hold,
    tap: tap,
    release: release,
    setDevice: setDevice,
    setMonitor: setMonitor,
    mountSwitch: mountSwitch,
    applySink: applySink, // (force, refused): the stored output onto the shared context
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
    // test hook: the live graph (+ owner: this document has the Hear-input lock)
    _t: function () {
      return { stream: stream, src: src, gain: gain, an: an, monOn: monOn, holds: Object.keys(holds), opening: !!opening, owner: owner };
    }
  };
})();
