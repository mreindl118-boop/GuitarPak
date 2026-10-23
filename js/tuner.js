/* soundLAB tuner module.
 *
 * Card 1 "Tuner": microphone pitch detection (autocorrelation / NSDF with
 * parabolic interpolation + median smoothing), big note readout, SVG cents
 * gauge, A4 calibration, string guide chips per tuning.
 * Card 2 "Note finder game": find a prompted string+fret by ear/feel; success
 * is detected from the same mic stream.
 *
 * All ids / injected CSS classes are prefixed "tun-". Settings persist under
 * store keys "tun.*". Registers as module 'tuner'.
 */
(function () {
  'use strict';

  // ---------- state ----------
  var els = {};
  var chipEls = [];
  var chipMidis = [];

  var CAPTURE_TAG = 'tuner-analysis';
  var source = null;      // shared audio-in source; never owned by the tuner
  var analyser = null;    // AnalyserNode, fftSize 2048
  var timeBuf = null;     // Float32Array for time-domain samples
  var rafId = 0;
  var listening = false;
  var pendingMic = false; // getUserMedia request in flight (permission prompt open)
  var startReq = 0, heldReq = 0, toneSuspended = false;
  var deviceId = '', lastPitch = null, lastAnnouncement = '', lastAnnouncedAt = -Infinity;
  var sampleRate = 48000;
  var recent = [];        // last raw detections (Hz) for median smoothing

  var a4 = 440;
  var tuningId = 'standard';

  var game = {
    target: null,         // { str, fret, midi }
    streak: 0,
    best: 0,
    matchSince: 0,        // performance.now() when the current match began
    waiting: false,       // true during the 700 ms post-success pause
    revealed: false,
    strings: [true, true, true, true, true, true],
    fretMin: 0,
    fretMax: 12,
    anyOct: false
  };
  var advTimer = 0;
  var flashTimer = 0;
  var refMuteUntil = 0;   // ignore game matches briefly after playing a reference
                          // tone, so the mic hearing the speakers can't fake a win

  var STRING_NAMES = ['low E', 'A', 'D', 'G', 'B', 'high E'];
  var PXC = 2.9;          // gauge pixels per cent (center x = 160)

  var CSS = '' +
    '#tun-gauge { display: block; max-width: 440px; width: 100%; margin: 8px auto 2px; }' +
    '.tun-note { min-height: 68px; }' +
    /* the readout, gauge and string chips share one centre line (the gauge 0) */
    '.tun-readout { text-align: center; }' +
    '#tun-chips { justify-content: center; }' +
    /* idle: a quiet placeholder dash, not a glowing white bar */
    '.tun-note.tun-idle { color: var(--ctl-border); text-shadow: none; }' +
    '.tun-row { align-items: flex-end; }' +
    '.tun-row .tun-strlabel { min-height: var(--h-ctl); }' +
    '.tun-stat { font-size: 11.5px; font-weight: 600; letter-spacing: 1.4px; text-transform: uppercase; color: var(--label); }' +
    '#tun-streak, #tun-best { color: var(--text); margin-left: 6px; letter-spacing: 1px; }' +
    '#tun-freq { font-variant-numeric: tabular-nums; margin-bottom: 2px; }' +
    '#tun-direction{font-weight:650;min-height:1.5em;text-align:center}.tun-announcement{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}' +
    '#sheet-tuner .grid2{grid-template-columns:1fr}#sheet-tuner .tun-row{flex-wrap:wrap}#sheet-tuner .tun-row .field{flex:1;min-width:120px}#sheet-tuner #tun-toggle{min-height:44px}#sheet-tuner .tun-chip{min-height:44px}#sheet-tuner #tun-game-card{margin-bottom:0}' +
    '#tun-chips { margin: 10px 0; }' +
    '.tun-chip { cursor: pointer; }' +
    '.tun-chip .tun-check { color: var(--green); display: none; }' +
    '.tun-chip.tun-near { border-color: var(--accent); color: var(--accent-ink); }' +
    '.tun-chip.tun-ok { border-color: var(--green); color: var(--green); }' +
    '.tun-chip.tun-ok .tun-check { display: inline; }' +
    '#tun-err { margin: 10px 0; }' +
    '.tun-readout { margin-top: 10px; }' +
    '.tun-target-line { font-size: 23px; font-weight: 700; margin: 12px 0; min-height: 33px; }' +
    '#tun-answer { color: var(--accent-ink); }' +
    '.tun-hint { border: 1px dashed var(--line); border-radius: 8px; padding: 10px 12px;' +
    '  color: var(--muted); margin-bottom: 10px; font-size: 13.5px; }' +
    '.tun-stats { margin: 14px 0; }' +
    '.tun-strlabel { display: inline-flex; align-items: center; gap: 6px; font-size: 13px;' +
    '  font-weight: 600; cursor: pointer; user-select: none; }' +
    '.tun-keys { margin-top: 10px; }' +
    '#tun-game-card.tun-flash { animation: tun-flash-kf 0.7s ease-out; }' +
    '@keyframes tun-flash-kf {' +
    '  0% { box-shadow: 0 0 0 3px var(--green); background: rgba(122, 217, 122, 0.14); }' +
    '  100% { box-shadow: 0 0 0 0 rgba(0, 0, 0, 0); }' +
    '}';

  // ---------- small helpers ----------

  function $(id) { return document.getElementById(id); }

  function clampInt(v, lo, hi, dflt) {
    v = parseInt(v, 10);
    if (isNaN(v)) return dflt;
    return Math.max(lo, Math.min(hi, v));
  }

  function median(arr) {
    var s = arr.slice().sort(function (x, y) { return x - y; });
    return s[s.length >> 1];
  }

  function ordinal(n) {
    var s = n % 10, t = n % 100;
    if (s === 1 && t !== 11) return n + 'st';
    if (s === 2 && t !== 12) return n + 'nd';
    if (s === 3 && t !== 13) return n + 'rd';
    return n + 'th';
  }

  function targetPhrase(t) {
    if (t.fret === 0) return 'Open ' + STRING_NAMES[t.str] + ' string';
    return ordinal(t.fret) + ' fret, ' + STRING_NAMES[t.str] + ' string';
  }

  // ---------- markup ----------

  function gaugeSVG() {
    var ticks = [[-50, '-50'], [-25, '-25'], [0, '0'], [25, '+25'], [50, '+50']];
    var t = '';
    for (var i = 0; i < ticks.length; i++) {
      var x = 160 + ticks[i][0] * PXC;
      t += '<line x1="' + x + '" y1="20" x2="' + x + '" y2="28" stroke="var(--line)" stroke-width="2"/>';
      t += '<text x="' + x + '" y="14" text-anchor="middle" font-size="10" fill="var(--muted)">' + ticks[i][1] + '</text>';
    }
    return '<svg id="tun-gauge" viewBox="0 0 320 92" preserveAspectRatio="xMidYMid meet" aria-label="cents gauge">' +
      '<rect x="15" y="32" width="290" height="12" rx="6" fill="var(--card2)" stroke="var(--line)"/>' +
      '<rect x="145.5" y="28" width="29" height="20" rx="4" fill="rgba(122,217,122,0.16)" stroke="var(--green)" stroke-width="1"/>' +
      t +
      '<line id="tun-needle" x1="160" y1="24" x2="160" y2="56" stroke="var(--muted)" stroke-width="3"' +
      ' stroke-linecap="round" transform="translate(0,0)"/>' +
      '<text id="tun-cents" x="160" y="80" text-anchor="middle" font-size="16" font-weight="700"' +
      ' fill="var(--muted)">— ¢</text>' +
      '</svg>';
  }

  function markup() {
    return '' +
      '<div class="grid2">' +

      '<div class="card">' +
      '<h2>Tuner</h2>' +
      '<div class="row tun-row">' +
      '<button type="button" class="btn primary" id="tun-toggle">Start listening</button>' +
      '<label class="field">A4 (Hz)' +
      '<input type="number" id="tun-a4" min="415" max="466" step="1"></label>' +
      '<label class="field">String guide tuning' +
      '<select id="tun-tuning"></select></label>' +
      '</div>' +
      '<p class="small muted">Uses the audio input selected in Settings. Listening does not enable Hear Input.</p>' +
      '<div id="tun-err" class="error" role="alert" hidden></div>' +
      '<div class="tun-readout">' +
      '<div class="big-display tun-note tun-idle" id="tun-note">—</div>' +
      '<div class="muted" id="tun-freq">Listening is off — press Start listening</div>' +
      '<div id="tun-direction">Listening is off</div><span class="tun-announcement" id="tun-announcement" role="status" aria-live="polite" aria-atomic="true"></span>' +
      '</div>' +
      gaugeSVG() +
      '<div class="row tight" id="tun-chips"></div>' +
      '<div class="muted small">Space starts / stops the mic. Click a string chip to hear its reference pitch.</div>' +
      '</div>' +

      '<div class="card" id="tun-game-card">' +
      '<h2>Note finder game</h2>' +
      '<div id="tun-hint" class="tun-hint">' + App.icon('up', 13) + ' Start listening in the Tuner card first — ' +
      'the game listens on the same microphone. Targets use standard tuning.</div>' +
      '<div class="tun-target-line">' +
      '<span id="tun-target"></span><span id="tun-eq"> = </span><span id="tun-answer">?</span>' +
      '</div>' +
      '<div class="row tight">' +
      '<button type="button" class="btn sm" id="tun-reveal">Reveal note</button>' +
      '<button type="button" class="btn sm" id="tun-hear">Hear it</button>' +
      '<button type="button" class="btn sm danger" id="tun-skip">Skip</button>' +
      '<span class="muted small" id="tun-status"></span>' +
      '</div>' +
      '<div class="row tun-stats">' +
      '<div class="tun-stat">Streak <span class="mid-display" id="tun-streak">0</span></div>' +
      '<div class="tun-stat">Best <span class="mid-display" id="tun-best">0</span></div>' +
      '</div>' +
      '<h3>Settings</h3>' +
      '<div class="row tight" id="tun-strings"></div>' +
      '<div class="row tight tun-row" style="margin-top:10px">' +
      '<label class="field">Fret from' +
      '<input type="number" id="tun-fret-min" min="0" max="21" step="1"></label>' +
      '<label class="field">Fret to' +
      '<input type="number" id="tun-fret-max" min="0" max="21" step="1"></label>' +
      '<label class="tun-strlabel"><input type="checkbox" id="tun-anyoct"> Accept any octave</label>' +
      '</div>' +
      '<div class="muted small tun-keys">Keys: H hear &middot; R reveal &middot; S skip</div>' +
      '</div>' +

      '</div>';
  }

  // ---------- pitch detection ----------
  // Normalized square-difference autocorrelation (NSDF, McLeod-style):
  // nsdf(lag) = 2*sum(x[i]*x[i+lag]) / sum(x[i]^2 + x[i+lag]^2) over a fixed window.
  // Pick the first local peak >= 0.9 * global max, refine with parabolic interpolation.

  function detectPitch(bufArr, sr) {
    var d = window.SLPitchDetector && window.SLPitchDetector.detect(bufArr, sr,
      { minFrequency: 55, maxFrequency: 1350, noiseFloor: 0.008 });
    return d && !d.ambiguous && d.confidence >= 0.5 ? d.frequency : -1;
  }

  // ---------- tuner rendering ----------

  function setNeedle(cents, color) {
    els.needle.setAttribute('transform', 'translate(' + (cents * PXC).toFixed(1) + ',0)');
    els.needle.setAttribute('stroke', color);
  }

  function clearChips() {
    for (var i = 0; i < chipEls.length; i++) {
      chipEls[i].classList.remove('tun-near');
      chipEls[i].classList.remove('tun-ok');
    }
  }

  function highlightChips(note) {
    var bestI = -1, bestD = 1e9, i, d;
    for (i = 0; i < chipMidis.length; i++) {
      d = Math.abs(note.midiFloat - chipMidis[i]);
      if (d < bestD) { bestD = d; bestI = i; }
    }
    for (i = 0; i < chipEls.length; i++) {
      var near = (i === bestI);
      var ok = near && Math.abs((note.midiFloat - chipMidis[i]) * 100) <= 5;
      chipEls[i].classList.toggle('tun-near', near && !ok);
      chipEls[i].classList.toggle('tun-ok', ok);
    }
  }

  function renderPitch(note, freq) {
    lastPitch = note ? { midi: note.midi, frequency: freq, cents: note.cents, name: note.name + note.octave } : null;
    if (!note) {
      els.note.textContent = '—';
      els.note.style.color = '';
      els.note.classList.add('tun-idle');
      els.freq.textContent = 'listening…';
      setNeedle(0, 'var(--muted)');
      els.cents.textContent = '— ¢';
      els.cents.setAttribute('fill', 'var(--muted)');
      els.direction.textContent = 'Waiting for a clear note';
      announce('Waiting for a clear note');
      clearChips();
      return;
    }
    els.note.textContent = note.name + note.octave;
    els.note.classList.remove('tun-idle');
    els.freq.textContent = freq.toFixed(1) + ' Hz';
    var abs = Math.abs(note.cents);
    var col = abs <= 5 ? 'var(--green)' : (abs >= 25 ? 'var(--red)' : 'var(--accent)');
    els.note.style.color = abs <= 5 ? 'var(--green)' : (abs >= 25 ? 'var(--red)' : '');
    setNeedle(Math.max(-50, Math.min(50, note.cents)), col);
    els.cents.textContent = (note.cents >= 0 ? '+' : '') + note.cents.toFixed(1) + ' ¢';
    els.cents.setAttribute('fill', col);
    var direction = abs <= 5 ? 'In tune' : note.cents < 0 ? 'Flat — tune up' : 'Sharp — tune down';
    els.direction.textContent = direction;
    announce(note.name + note.octave + ', ' + direction + ', ' + Math.abs(note.cents).toFixed(1) + ' cents');
    highlightChips(note);
  }

  function renderIdle() {
    lastPitch = null;
    els.note.textContent = '—';
    els.note.style.color = '';
    els.note.classList.add('tun-idle');
    els.freq.textContent = 'Listening is off — press Start listening';
    els.direction.textContent = 'Listening is off';
    announce('Listening is off');
    setNeedle(0, 'var(--muted)');
    els.cents.textContent = '— ¢';
    els.cents.setAttribute('fill', 'var(--muted)');
    clearChips();
  }

  // ---------- mic lifecycle ----------

  function showErr(msg) { els.err.textContent = msg; els.err.hidden = false; }
  function hideErr() { els.err.hidden = true; }
  function visible() { return App.sheet === 'tuner' && !document.hidden; }
  function announce(text) {
    var now = performance.now();
    if (!els.announcement || text === lastAnnouncement || now - lastAnnouncedAt < 750) return;
    lastAnnouncement = text; lastAnnouncedAt = now; els.announcement.textContent = text;
  }

  function frame(token) {
    if (token !== startReq || !listening) return;
    if (!visible()) { stopMic(); return; }
    rafId = requestAnimationFrame(function () { frame(token); });
    if (!analyser || !timeBuf) return;
    try { analyser.getFloatTimeDomainData(timeBuf); }
    catch (error) { stopMic(); showErr('The input became unavailable. Start listening again when ready.'); return; }
    var f = detectPitch(timeBuf, sampleRate);
    var now = performance.now();
    if (f > 0) {
      recent.push(f);
      if (recent.length > 5) recent.shift();
      var med = median(recent);
      var note = Theory.freqToNote(med, a4);
      renderPitch(note, med);
      updateGame(note, now);
    } else {
      recent.length = 0;
      renderPitch(null, 0);
      updateGame(null, now);
    }
  }

  function startMic() {
    if (listening || pendingMic || !visible()) return;
    hideErr();
    var input = App.audioIn;
    if (!input || !input.supported || !input.hold || !input.tap || !input.release) {
      showErr('Audio input is unavailable here. Use a supported browser on HTTPS or localhost.');
      return;
    }
    App.emit('transport:claim', { owner: 'tuner' });
    if (!visible()) return;
    var token = ++startReq, selected = App.store.get('audio.inId', '');
    pendingMic = true;
    els.toggle.disabled = false;
    els.toggle.textContent = 'Cancel listening';
    els.direction.textContent = 'Opening the selected input…';
    if (App.tonein && App.tonein.suspend) { toneSuspended = true; App.tonein.suspend(CAPTURE_TAG, true); }
    heldReq = token;
    Promise.resolve().then(function () {
      if (token !== startReq) return null;
      if (!visible()) { stopMic(); return null; }
      return input.hold(CAPTURE_TAG, { exact: true });
    }).then(function (state) {
      // A canceled request has already released its lease. In particular it
      // must not remove the same-tag hold acquired by a newer Start.
      if (token !== startReq) return;
      if (!visible()) { stopMic(); return; }
      var tap = input.tap(CAPTURE_TAG);
      if (!tap || !state || !state.on || state.fell || selected && state.device !== selected) {
        throw new Error(state && (state.error || state.msg) || 'The selected input could not be opened; no replacement input was chosen.');
      }
      source = tap.source;
      analyser = tap.context.createAnalyser();
      analyser.fftSize = 2048;
      source.connect(analyser); // analysis only; shared service owns the stream
      sampleRate = tap.context.sampleRate;
      deviceId = tap.deviceId || state.device || '';
      pendingMic = false;
      timeBuf = new Float32Array(analyser.fftSize);
      recent.length = 0;
      game.matchSince = 0;
      listening = true;
      App.wake.acquire('tun-mic');
      els.toggle.disabled = false;
      els.toggle.textContent = 'Stop listening';
      els.toggle.classList.remove('primary');
      els.toggle.classList.add('danger');
      updateGameUI();
      rafId = requestAnimationFrame(function () { frame(token); });
    }).catch(function (error) {
      if (token !== startReq) return;
      stopMic();
      showErr(error && error.message || 'The selected audio input could not be opened. Start listening again when ready.');
    });
  }

  function stopMic() {
    startReq += 1;
    pendingMic = false;
    listening = false;
    if (rafId) { cancelAnimationFrame(rafId); rafId = 0; }
    if (source && analyser) { try { source.disconnect(analyser); } catch (e) { /* only this owner's edge */ } }
    source = null;
    if (analyser) {
      try { analyser.disconnect(); } catch (e) { /* not connected */ }
      analyser = null;
    }
    timeBuf = null;
    deviceId = '';
    if (heldReq) { heldReq = 0; if (App.audioIn) App.audioIn.release(CAPTURE_TAG); }
    if (toneSuspended) { toneSuspended = false; if (App.tonein && App.tonein.suspend) App.tonein.suspend(CAPTURE_TAG, false); }
    App.wake.release('tun-mic');
    recent.length = 0;
    game.matchSince = 0;
    if (els.toggle) {
      els.toggle.disabled = false;
      els.toggle.textContent = 'Start listening';
      els.toggle.classList.add('primary');
      els.toggle.classList.remove('danger');
      els.status.textContent = '';
      renderIdle();
      updateGameUI();
    }
  }

  function toggleMic() {
    if (listening || pendingMic) stopMic();      // pending: treat as cancel
    else startMic();
  }

  // ---------- string guide ----------

  function buildChips() {
    var t = Theory.TUNINGS[tuningId] || Theory.TUNINGS.standard;
    chipMidis = t.midi.slice();
    chipEls = [];
    els.chips.innerHTML = '';
    for (var i = 0; i < chipMidis.length; i++) {
      (function (midi) {
        var b = document.createElement('button');
        b.type = 'button';
        b.className = 'chip tun-chip';
        b.title = 'Play reference ' + Theory.midiName(midi);
        var name = document.createElement('span');
        name.textContent = Theory.midiName(midi);
        var check = document.createElement('span');
        check.className = 'tun-check';
        check.textContent = '✓';
        b.appendChild(name);
        b.appendChild(check);
        b.addEventListener('click', function () { playReference(midi); });
        els.chips.appendChild(b);
        chipEls.push(b);
      })(chipMidis[i]);
    }
  }

  // ---------- game ----------

  function newTarget() {
    game.waiting = false;
    game.matchSince = 0;
    game.revealed = false;
    var lo = Math.min(game.fretMin, game.fretMax);
    var hi = Math.max(game.fretMin, game.fretMax);
    var pool = [];
    for (var s = 0; s < 6; s++) {
      if (!game.strings[s]) continue;
      for (var f = lo; f <= hi; f++) pool.push({ str: s, fret: f });
    }
    if (!pool.length) {
      game.target = null;
      updateGameUI();
      return;
    }
    var pick, guard = 0;
    do {
      pick = pool[Math.floor(Math.random() * pool.length)];
      guard += 1;
    } while (game.target && pool.length > 1 && guard < 25 &&
             pick.str === game.target.str && pick.fret === game.target.fret);
    game.target = { str: pick.str, fret: pick.fret, midi: Theory.fretMidi(pick.str, pick.fret, 'standard') };
    updateGameUI();
  }

  function retargetIfInvalid() {
    var t = game.target;
    var lo = Math.min(game.fretMin, game.fretMax);
    var hi = Math.max(game.fretMin, game.fretMax);
    if (!t || !game.strings[t.str] || t.fret < lo || t.fret > hi) newTarget();
    else updateGameUI();
  }

  function updateGameUI() {
    els.streak.textContent = String(game.streak);
    els.best.textContent = String(game.best);
    els.hint.hidden = listening;
    var t = game.target;
    if (!t) {
      els.target.textContent = 'Enable at least one string below.';
      els.eq.hidden = true;
      els.answer.hidden = true;
      els.hear.disabled = true;
      els.reveal.disabled = true;
      els.skip.disabled = true;
      els.status.textContent = '';
      return;
    }
    els.eq.hidden = false;
    els.answer.hidden = false;
    els.hear.disabled = false;
    els.reveal.disabled = false;
    els.skip.disabled = false;
    els.target.textContent = targetPhrase(t);
    els.answer.textContent = game.revealed ? Theory.midiName(t.midi) : '?';
    els.reveal.textContent = game.revealed ? 'Hide note' : 'Reveal note';
  }

  function gameSuccess() {
    game.streak += 1;
    if (game.streak > game.best) {
      game.best = game.streak;
      App.store.set('tun.bestStreak', game.best);
    }
    game.waiting = true;
    game.revealed = true;                        // show the answer during the flash
    updateGameUI();
    els.status.textContent = 'Nice!';
    var card = els.gameCard;
    card.classList.remove('tun-flash');
    void card.offsetWidth;                       // restart the CSS animation
    card.classList.add('tun-flash');
    if (flashTimer) clearTimeout(flashTimer);
    flashTimer = setTimeout(function () {
      flashTimer = 0;
      card.classList.remove('tun-flash');
    }, 750);
    if (advTimer) clearTimeout(advTimer);
    advTimer = setTimeout(function () {
      advTimer = 0;
      els.status.textContent = '';
      newTarget();
    }, 700);
  }

  function playReference(midi) {
    refMuteUntil = performance.now() + 2000;
    game.matchSince = 0;
    // App.pluck assumes A4 = 440, but detection uses the calibrated a4;
    // shift the (fractional) midi by the calibration offset in semitones so
    // reference tones agree with what the tuner/game calls "in tune".
    App.pluck(midi + 12 * (Math.log(a4 / 440) / Math.LN2), 0, 1.6, 0.45);
  }

  function updateGame(note, now) {
    if (!listening || !game.target || game.waiting) return;
    if (now < refMuteUntil) {
      game.matchSince = 0;
      els.status.textContent = '';               // don't leave 'Hold it…' stuck
      return;
    }
    var t = game.target;
    var match = false;
    if (note) {
      var pitchOk = game.anyOct ? (note.pc === Theory.mod12(t.midi)) : (note.midi === t.midi);
      match = pitchOk && Math.abs(note.cents) <= 25;
    }
    if (match) {
      if (!game.matchSince) game.matchSince = now;
      if (now - game.matchSince >= 300) {
        game.matchSince = 0;
        gameSuccess();
        return;
      }
      els.status.textContent = 'Hold it…';
    } else {
      game.matchSince = 0;
      els.status.textContent = '';
    }
  }

  // ---------- settings UI ----------

  function buildStringChecks() {
    els.stringsWrap.innerHTML = '';
    for (var s = 0; s < 6; s++) {
      (function (idx) {
        var lab = document.createElement('label');
        lab.className = 'tun-strlabel';
        var cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.checked = game.strings[idx];
        cb.addEventListener('change', function () {
          game.strings[idx] = cb.checked;
          App.store.set('tun.strings', game.strings);
          retargetIfInvalid();
        });
        lab.appendChild(cb);
        lab.appendChild(document.createTextNode(' ' + STRING_NAMES[idx]));
        els.stringsWrap.appendChild(lab);
      })(s);
    }
  }

  function wireFretInput(inp, storeKey, isMin) {
    inp.value = isMin ? game.fretMin : game.fretMax;
    inp.addEventListener('change', function () {
      var v = clampInt(inp.value, 0, 21, isMin ? 0 : 12);
      if (isMin) game.fretMin = v;
      else game.fretMax = v;
      inp.value = v;
      App.store.set(storeKey, v);
      retargetIfInvalid();
    });
  }

  // ---------- module ----------

  function init(rootEl) {
    a4 = clampInt(App.store.get('tun.a4', 440), 415, 466, 440);
    tuningId = App.store.get('tun.tuning', 'standard');
    if (!Theory.TUNINGS[tuningId]) tuningId = 'standard';
    var b = App.store.get('tun.bestStreak', 0);
    game.best = (typeof b === 'number' && isFinite(b) && b > 0) ? Math.floor(b) : 0;
    var st = App.store.get('tun.strings', null);
    if (Object.prototype.toString.call(st) === '[object Array]' && st.length === 6) {
      game.strings = st.map(function (x) { return !!x; });
    }
    game.fretMin = clampInt(App.store.get('tun.fretMin', 0), 0, 21, 0);
    game.fretMax = clampInt(App.store.get('tun.fretMax', 12), 0, 21, 12);
    game.anyOct = !!App.store.get('tun.anyOct', false);

    App.injectCSS('tuner', CSS);
    rootEl.innerHTML = markup();

    els = {
      toggle: $('tun-toggle'), a4: $('tun-a4'), tuning: $('tun-tuning'),
      err: $('tun-err'), note: $('tun-note'), freq: $('tun-freq'),
      needle: $('tun-needle'), cents: $('tun-cents'), chips: $('tun-chips'),
      direction: $('tun-direction'), announcement: $('tun-announcement'),
      gameCard: $('tun-game-card'), hint: $('tun-hint'), target: $('tun-target'),
      eq: $('tun-eq'), answer: $('tun-answer'), reveal: $('tun-reveal'),
      hear: $('tun-hear'), skip: $('tun-skip'), status: $('tun-status'),
      streak: $('tun-streak'), best: $('tun-best'),
      fretMin: $('tun-fret-min'), fretMax: $('tun-fret-max'),
      anyOct: $('tun-anyoct'), stringsWrap: $('tun-strings')
    };

    // tuner card controls
    els.toggle.addEventListener('click', toggleMic);

    els.a4.value = a4;
    els.a4.addEventListener('change', function () {
      var v = clampInt(els.a4.value, 415, 466, 440);
      a4 = v;
      els.a4.value = v;
      App.store.set('tun.a4', v);
    });

    for (var i = 0; i < Theory.TUNING_ORDER.length; i++) {
      var id = Theory.TUNING_ORDER[i];
      var opt = document.createElement('option');
      opt.value = id;
      opt.textContent = Theory.TUNINGS[id].name;
      els.tuning.appendChild(opt);
    }
    els.tuning.value = tuningId;
    els.tuning.addEventListener('change', function () {
      tuningId = els.tuning.value;
      if (!Theory.TUNINGS[tuningId]) tuningId = 'standard';
      App.store.set('tun.tuning', tuningId);
      buildChips();
    });
    buildChips();

    // game card controls
    els.reveal.addEventListener('click', function () {
      if (!game.target) return;
      game.revealed = !game.revealed;
      updateGameUI();
    });
    els.hear.addEventListener('click', function () {
      if (game.target) playReference(game.target.midi);
    });
    els.skip.addEventListener('click', function () {
      if (!game.target && !advTimer) { newTarget(); return; }
      game.streak = 0;
      if (advTimer) { clearTimeout(advTimer); advTimer = 0; }
      els.status.textContent = '';
      newTarget();
    });

    buildStringChecks();
    wireFretInput(els.fretMin, 'tun.fretMin', true);
    wireFretInput(els.fretMax, 'tun.fretMax', false);
    els.anyOct.checked = game.anyOct;
    els.anyOct.addEventListener('change', function () {
      game.anyOct = els.anyOct.checked;
      App.store.set('tun.anyOct', game.anyOct);
    });

    newTarget();
    renderIdle();
    updateGameUI();
    App.on('audioin:device', function () {
      if (!listening && !pendingMic) return;
      stopMic(); showErr('The audio input changed. Start listening again when ready.');
    });
    App.on('audioin:state', function (state) {
      if (!listening) return;
      var tap = App.audioIn && App.audioIn.tap(CAPTURE_TAG);
      if (!state.on || !tap || tap.source !== source) { stopMic(); showErr('The audio input disconnected. Reconnect and start listening again.'); }
    });
    App.on('transport:claim', function (event) { if (event && event.owner !== 'tuner' && (listening || pendingMic)) stopMic(); });
    document.addEventListener('visibilitychange', function () { if (document.hidden) onHide(); });
    window.addEventListener('pagehide', onHide);
  }

  function onShow() {
    updateGameUI();
  }

  function onHide() {
    stopMic();
    if (advTimer) {
      clearTimeout(advTimer);
      advTimer = 0;
      els.status.textContent = '';
      newTarget();                               // leave the game in a clean state
    }
    if (flashTimer) {
      clearTimeout(flashTimer);
      flashTimer = 0;
      els.gameCard.classList.remove('tun-flash');
    }
  }

  function onKey(e) {
    if (e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
    var target = e.target;
    if (target && (target.isContentEditable || target.closest && target.closest('button,a,input,select,textarea,summary'))) return;
    var k = e.key;
    if (k === ' ' || e.code === 'Space') {
      e.preventDefault();
      toggleMic();
    } else if (k === 'h' || k === 'H') {
      if (game.target) playReference(game.target.midi);
    } else if (k === 'r' || k === 'R') {
      if (game.target) {
        game.revealed = !game.revealed;
        updateGameUI();
      }
    } else if (k === 's' || k === 'S') {
      if (game.target) els.skip.click();
    }
  }

  App.register('tuner', {
    init: init,
    onShow: onShow,
    onHide: onHide,
    onKey: onKey
  });
  App.tuner = { stop: stopMic, get state() { return { listening: listening, pending: pendingMic, deviceId: deviceId,
    visible: visible(), a4: a4, tuning: tuningId, pitch: lastPitch && Object.assign({}, lastPitch), error: els.err && !els.err.hidden ? els.err.textContent : '' }; } };
})();
