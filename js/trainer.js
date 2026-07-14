/* GuitarLab — trainer module.
 * Practice dashboard: session log, random prompts, one-minute chord changes,
 * interval ear trainer. Four cards in a .grid2. No dependencies beyond App/Theory.
 */
(function () {
  'use strict';

  var IV_ABBR = ['m2', 'M2', 'm3', 'M3', 'P4', 'TT', 'P5', 'm6', 'M6', 'm7', 'M7', 'P8'];
  var IV_FULL = ['minor 2nd', 'major 2nd', 'minor 3rd', 'major 3rd', 'perfect 4th',
    'tritone', 'perfect 5th', 'minor 6th', 'major 6th', 'minor 7th', 'major 7th', 'octave'];
  var CC_CHORDS = ['C', 'A', 'G', 'E', 'D', 'F', 'Am', 'Em', 'Dm', 'B7', 'A7', 'D7', 'E7', 'G7', 'C7'];

  // ---------- state ----------
  var els = {};
  var ansBtns = [];

  // card 1: session log
  var sessAccum = 0;        // accumulated ms while paused
  var sessRunning = false;
  var sessStamp = 0;        // Date.now() at last start/resume
  var sessInt = null;

  // card 2: prompts
  var promptCur = '';
  var promptHist = [];

  // card 3: chord changes
  var ccRunning = false;
  var ccInt = null;
  var ccEnd = 0;
  var ccN = 0;

  // card 4: ear trainer
  var earPair = null;
  var earAnswered = false;
  var earScore = 0;
  var earStreak = 0;
  var earBest = 0;
  var earNextTO = null;
  var earFlashTOs = [];

  // ---------- small helpers ----------
  function $(id) { return document.getElementById(id); }
  function rand(n) { return Math.floor(Math.random() * n); }
  function pick(arr) { return arr[rand(arr.length)]; }
  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function pad2(n) { return (n < 10 ? '0' : '') + n; }
  function fmtClock(ms) {
    var s = Math.floor(ms / 1000);
    return pad2(Math.floor(s / 60)) + ':' + pad2(s % 60);
  }
  function randPc() { return rand(12); }
  function keyName(pc) { return Theory.pcName(pc, Theory.FLAT_KEYS.has(pc)); }
  function randChordName() {
    var pc = randPc();
    return Theory.chordName(pc, pick(Theory.QUALITY_ORDER), Theory.FLAT_KEYS.has(pc));
  }

  // ================================================================
  // Card 1 — practice session log
  // ================================================================
  function getSessions() {
    var a = App.store.get('tr.sessions', []);
    return Array.isArray(a) ? a : [];
  }

  function sessTotalMs() {
    return sessAccum + (sessRunning ? Date.now() - sessStamp : 0);
  }

  function sessRender() {
    els.sessTime.textContent = fmtClock(sessTotalMs());
  }

  function sessButtons() {
    els.sessStart.disabled = sessRunning;
    els.sessStart.textContent = (!sessRunning && sessAccum > 0) ? 'Resume' : 'Start';
    els.sessPause.disabled = !sessRunning;
    els.sessFinish.disabled = sessTotalMs() < 1000;
  }

  function sessStart() {
    if (sessRunning) return;
    sessRunning = true;
    App.wake.acquire('tr-sess');
    sessStamp = Date.now();
    sessInt = setInterval(function () { sessRender(); sessButtons(); }, 250);
    sessRender();
    sessButtons();
  }

  function sessPause() {
    if (!sessRunning) return;
    sessAccum += Date.now() - sessStamp;
    sessRunning = false;
    App.wake.release('tr-sess');
    if (sessInt) { clearInterval(sessInt); sessInt = null; }
    sessRender();
    sessButtons();
  }

  function sessFinish() {
    if (sessRunning) sessPause();
    if (sessAccum < 1000) return;
    var minutes = Math.max(1, Math.round(sessAccum / 60000));
    var label = els.sessLabel.value.trim() || 'Practice';
    var arr = getSessions();
    arr.push({ dateISO: new Date().toISOString(), minutes: minutes, label: label });
    App.store.set('tr.sessions', arr);
    sessAccum = 0;
    sessRender();
    sessButtons();
    renderSessions();
  }

  function sessClear() {
    if (!confirm('Delete all practice session history?')) return;
    App.store.set('tr.sessions', []);
    renderSessions();
  }

  function renderSessions() {
    var arr = getSessions();
    var cutoff = Date.now() - 7 * 86400000;
    var week = 0;
    for (var i = 0; i < arr.length; i++) {
      var t = Date.parse(arr[i].dateISO);
      if (!isNaN(t) && t >= cutoff) week += arr[i].minutes || 0;
    }
    els.sessWeek.textContent = 'Last 7 days: ' + week + ' min across ' + arr.length +
      ' logged session' + (arr.length === 1 ? '' : 's') + ' total';

    var recent = arr.slice(-12).reverse();
    if (!recent.length) {
      els.sessList.innerHTML = '<li><span class="muted">No sessions logged yet.</span></li>';
      return;
    }
    var html = '';
    for (var j = 0; j < recent.length; j++) {
      var e = recent[j];
      var d = new Date(e.dateISO);
      var when = isNaN(d.getTime()) ? '?' : (d.getMonth() + 1) + '/' + d.getDate();
      html += '<li><span>' + esc(e.label) + ' — ' + (e.minutes || 0) + 'm</span>' +
        '<span class="muted">' + when + '</span></li>';
    }
    els.sessList.innerHTML = html;
  }

  // ================================================================
  // Card 2 — random practice prompts
  // ================================================================
  var CHALLENGES = [
    function () {
      return 'Play "' + pick(Theory.PROGRESSIONS).name + '" in ' + keyName(randPc());
    },
    function () {
      return 'Improvise over ' + keyName(randPc()) + ' ' +
        Theory.SCALES[pick(Theory.SCALE_ORDER)].name + ' at ' + (60 + rand(61)) + ' BPM';
    },
    function () {
      var a = 1 + rand(6), b = 1 + rand(6);
      while (b === a) b = 1 + rand(6);
      return 'Find every ' + keyName(randPc()) + ' on strings ' + a + ' and ' + b;
    },
    function () {
      return 'Play the ' + randChordName() + ' arpeggio in three positions';
    },
    function () {
      var pc = randPc();
      var dia = Theory.diatonic(pc, 'major', false);
      var names = [];
      for (var i = 0; i < dia.length; i++) names.push(dia[i].name);
      return 'Play the diatonic chords of ' + keyName(pc) + ' major: ' + names.join(' – ');
    },
    function () {
      var a = pick(CC_CHORDS), b = pick(CC_CHORDS);
      while (b === a) b = pick(CC_CHORDS);
      return 'Switch between ' + a + ' and ' + b + ' every bar at ' + (60 + rand(61)) + ' BPM';
    }
  ];

  function setPrompt(text) {
    if (promptCur) {
      promptHist.unshift(promptCur);
      if (promptHist.length > 5) promptHist.length = 5;
    }
    promptCur = text;
    els.prCur.textContent = text;
    renderPromptHist();
  }

  function renderPromptHist() {
    if (!promptHist.length) {
      els.prPrevHead.style.display = 'none';
      els.prHist.innerHTML = '';
      return;
    }
    els.prPrevHead.style.display = '';
    var html = '';
    for (var i = 0; i < promptHist.length; i++) {
      html += '<li><span class="muted">' + esc(promptHist[i]) + '</span></li>';
    }
    els.prHist.innerHTML = html;
  }

  // ================================================================
  // Card 3 — one-minute chord changes
  // ================================================================
  function ccPairKey() {
    var pair = [els.ccA.value, els.ccB.value];
    pair.sort();
    return pair.join('-');
  }

  function updateBestChip() {
    var b = App.store.get('tr.best.' + ccPairKey(), null);
    els.ccBest.textContent = 'best: ' + (b == null ? '—' : b);
  }

  function ccStart() {
    if (ccRunning) return;
    App.getAudio(); // user gesture: unlock audio for the end-of-run chime
    ccRunning = true;
    App.wake.acquire('tr-cc');
    ccN = 0;
    ccEnd = Date.now() + 60000;
    els.ccNum.textContent = '0';
    els.ccResult.textContent = '';
    els.ccStart.disabled = true;
    els.ccA.disabled = true;
    els.ccB.disabled = true;
    els.ccCount.disabled = false;
    ccTick();
    ccInt = setInterval(ccTick, 150);
  }

  function ccTick() {
    var rem = ccEnd - Date.now();
    if (rem <= 0) { ccFinish(); return; }
    els.ccClock.textContent = String(Math.ceil(rem / 1000));
  }

  function ccFinish() {
    if (ccInt) { clearInterval(ccInt); ccInt = null; }
    ccRunning = false;
    App.wake.release('tr-cc');
    els.ccClock.textContent = '0';
    // chime: two quick high plucks
    App.pluck(76, 0, 0.3, 0.5);
    App.pluck(83, 0.15, 0.5, 0.5);
    var cpm = ccN;
    var key = 'tr.best.' + ccPairKey();
    var prev = App.store.get(key, null);
    var isBest = cpm > 0 && (prev == null || cpm > prev);
    if (isBest) App.store.set(key, cpm);
    els.ccResult.textContent = cpm + ' changes per minute' + (isBest ? ' — new best!' : '');
    updateBestChip();
    els.ccStart.disabled = false;
    els.ccA.disabled = false;
    els.ccB.disabled = false;
    els.ccCount.disabled = true;
  }

  function ccReset(showCancelMsg) {
    if (ccInt) { clearInterval(ccInt); ccInt = null; }
    var wasRunning = ccRunning;
    ccRunning = false;
    App.wake.release('tr-cc');
    ccN = 0;
    els.ccClock.textContent = '60';
    els.ccNum.textContent = '0';
    els.ccResult.textContent = (wasRunning && showCancelMsg) ? 'Run cancelled.' : '';
    els.ccStart.disabled = false;
    els.ccA.disabled = false;
    els.ccB.disabled = false;
    els.ccCount.disabled = true;
  }

  function ccCount() {
    if (!ccRunning) return;
    ccN++;
    els.ccNum.textContent = String(ccN);
  }

  // ================================================================
  // Card 4 — interval ear trainer
  // ================================================================
  function clearAnsClasses() {
    for (var i = 0; i < ansBtns.length; i++) {
      ansBtns[i].classList.remove('tr-good', 'tr-bad', 'tr-reveal');
    }
  }

  function renderEarStats() {
    els.earScore.textContent = String(earScore);
    els.earStreak.textContent = String(earStreak);
    els.earBestEl.textContent = String(earBest);
  }

  function earSound() {
    if (!earPair) return;
    if (els.earHarm.checked) {
      App.pluck(earPair.root, 0, 1.4, 0.3);
      App.pluck(earPair.root + earPair.iv, 0, 1.4, 0.3);
    } else {
      App.pluck(earPair.root, 0, 1.1, 0.4);
      App.pluck(earPair.root + earPair.iv, 0.5, 1.1, 0.4);
    }
  }

  function earNewPair() {
    if (earNextTO) { clearTimeout(earNextTO); earNextTO = null; }
    earPair = { root: 40 + rand(37), iv: 1 + rand(12) }; // root 40..76, interval 1..12
    earAnswered = false;
    clearAnsClasses();
    for (var i = 0; i < ansBtns.length; i++) ansBtns[i].disabled = false;
    els.earReplay.disabled = false;
    els.earMsg.textContent = 'Listen… which interval is it?';
    earSound();
  }

  function earFlash(btn, cls) {
    btn.classList.add(cls);
    earFlashTOs.push(setTimeout(function () { btn.classList.remove(cls); }, 550));
  }

  function earAnswer(iv, btn) {
    if (!earPair || earAnswered) return;
    earAnswered = true;
    App.getAudio(); // click gesture: keep context unlocked for the delayed next pair
    if (iv === earPair.iv) {
      earFlash(btn, 'tr-good');
      earScore++;
      earStreak++;
      if (earStreak > earBest) {
        earBest = earStreak;
        App.store.set('tr.earBest', earBest);
      }
      els.earMsg.textContent = 'Correct — ' + IV_FULL[earPair.iv - 1] + '!';
      earNextTO = setTimeout(function () {
        earNextTO = null;
        earNewPair();
      }, 900);
    } else {
      earFlash(btn, 'tr-bad');
      ansBtns[earPair.iv - 1].classList.add('tr-reveal');
      earStreak = 0;
      els.earMsg.textContent = 'It was ' + IV_FULL[earPair.iv - 1] + ' (' +
        IV_ABBR[earPair.iv - 1] + '). Press Play for a new one.';
    }
    renderEarStats();
  }

  // ================================================================
  // module wiring
  // ================================================================
  function init(root) {
    App.injectCSS('trainer', [
      '.tr-mt { margin-top: 10px; }',
      '.tr-prompt { font-size: 23px; line-height: 1.3; margin: 14px 0 10px; min-height: 30px; }',
      '.tr-prompt-hist li { font-size: 12.5px; }',
      '.tr-label-input { width: 230px; max-width: 100%; }',
      '.tr-cc-count { width: 100%; font-size: 22px; padding: 20px 10px; margin: 12px 0 10px; border-radius: 12px; }',
      '.tr-cc-count:not([disabled]) { background: var(--accent); color: #171106; border-color: var(--accent); }',
      '.tr-cc-changes { text-align: center; }',
      '.tr-ear-grid { display: grid; grid-template-columns: repeat(6, 1fr); gap: 6px; margin: 14px 0 12px; }',
      '@media (max-width: 520px) { .tr-ear-grid { grid-template-columns: repeat(4, 1fr); } }',
      '.tr-ear-ans { padding: 10px 4px; font-size: 13.5px; }',
      '.tr-good { background: var(--green) !important; color: #12240f !important; border-color: var(--green) !important; }',
      '.tr-bad { background: var(--red) !important; color: #2a0f0f !important; border-color: var(--red) !important; }',
      '.tr-reveal { outline: 2px solid var(--green); outline-offset: 1px; }',
      '.tr-harm-chip { cursor: pointer; }'
    ].join('\n'));

    var ccOpts = '';
    for (var i = 0; i < CC_CHORDS.length; i++) {
      ccOpts += '<option value="' + CC_CHORDS[i] + '">' + CC_CHORDS[i] + '</option>';
    }
    var ansHtml = '';
    for (var j = 0; j < IV_ABBR.length; j++) {
      ansHtml += '<button class="btn tr-ear-ans" data-tr-iv="' + (j + 1) + '" disabled>' +
        IV_ABBR[j] + '</button>';
    }

    root.innerHTML =
      '<div class="grid2">' +

      // ---- card 1: session log ----
      '<div class="card">' +
        '<h2>Practice session log</h2>' +
        '<div class="row tight">' +
          '<label class="field">what are you practicing?' +
            '<input type="text" id="tr-sess-label" class="tr-label-input" maxlength="60" placeholder="e.g. barre chords">' +
          '</label>' +
        '</div>' +
        '<div class="row tr-mt">' +
          '<div class="mid-display" id="tr-sess-time">00:00</div>' +
          '<button class="btn primary" id="tr-sess-start">Start</button>' +
          '<button class="btn" id="tr-sess-pause" disabled>Pause</button>' +
          '<button class="btn" id="tr-sess-finish" disabled>Finish</button>' +
        '</div>' +
        '<div class="small muted tr-mt" id="tr-sess-week"></div>' +
        '<ul class="list tr-mt" id="tr-sess-list"></ul>' +
        '<div class="row tr-mt">' +
          '<button class="btn danger sm" id="tr-sess-clear">Clear history</button>' +
        '</div>' +
      '</div>' +

      // ---- card 2: prompts ----
      '<div class="card">' +
        '<h2>Random practice prompts</h2>' +
        '<div class="row tight">' +
          '<button class="btn" id="tr-pr-key">Random key</button>' +
          '<button class="btn" id="tr-pr-mode">Random mode</button>' +
          '<button class="btn" id="tr-pr-chord">Random chord</button>' +
          '<button class="btn primary" id="tr-pr-chal">Random challenge</button>' +
        '</div>' +
        '<div class="mid-display tr-prompt" id="tr-pr-cur">Press a button for a prompt…</div>' +
        '<div class="small muted" id="tr-pr-prevhead" style="display:none">Previous</div>' +
        '<ul class="list tr-prompt-hist" id="tr-pr-hist"></ul>' +
      '</div>' +

      // ---- card 3: one-minute chord changes ----
      '<div class="card">' +
        '<h2>One-minute chord changes</h2>' +
        '<div class="row tight">' +
          '<label class="field">chord A<select id="tr-cc-a">' + ccOpts + '</select></label>' +
          '<label class="field">chord B<select id="tr-cc-b">' + ccOpts + '</select></label>' +
          '<span class="chip" id="tr-cc-best">best: —</span>' +
        '</div>' +
        '<div class="row tr-mt">' +
          '<div class="big-display" id="tr-cc-clock">60</div>' +
          '<div class="tr-cc-changes">' +
            '<div class="mid-display" id="tr-cc-num">0</div>' +
            '<div class="small muted">changes</div>' +
          '</div>' +
        '</div>' +
        '<button class="btn tr-cc-count" id="tr-cc-count" disabled>+1 change (or Space)</button>' +
        '<div class="row tight">' +
          '<button class="btn primary" id="tr-cc-start">Start 60 s</button>' +
          '<button class="btn" id="tr-cc-reset">Reset</button>' +
          '<span class="small muted" id="tr-cc-result"></span>' +
        '</div>' +
      '</div>' +

      // ---- card 4: interval ear trainer ----
      '<div class="card">' +
        '<h2>Interval ear trainer</h2>' +
        '<div class="row tight">' +
          '<button class="btn primary" id="tr-ear-play">Play interval</button>' +
          '<button class="btn" id="tr-ear-replay" disabled>Replay</button>' +
          '<label class="chip tr-harm-chip"><input type="checkbox" id="tr-ear-harm"> harmonic</label>' +
        '</div>' +
        '<div class="tr-ear-grid" id="tr-ear-grid">' + ansHtml + '</div>' +
        '<div class="row tight">' +
          '<span class="chip">score <b id="tr-ear-score">0</b></span>' +
          '<span class="chip">streak <b id="tr-ear-streak">0</b></span>' +
          '<span class="chip">best <b id="tr-ear-best">0</b></span>' +
        '</div>' +
        '<div class="small muted tr-mt" id="tr-ear-msg">Press Play to hear an interval.</div>' +
      '</div>' +

      '</div>';

    // cache elements
    els.sessLabel = $('tr-sess-label');
    els.sessTime = $('tr-sess-time');
    els.sessStart = $('tr-sess-start');
    els.sessPause = $('tr-sess-pause');
    els.sessFinish = $('tr-sess-finish');
    els.sessWeek = $('tr-sess-week');
    els.sessList = $('tr-sess-list');
    els.sessClear = $('tr-sess-clear');
    els.prCur = $('tr-pr-cur');
    els.prPrevHead = $('tr-pr-prevhead');
    els.prHist = $('tr-pr-hist');
    els.ccA = $('tr-cc-a');
    els.ccB = $('tr-cc-b');
    els.ccBest = $('tr-cc-best');
    els.ccClock = $('tr-cc-clock');
    els.ccNum = $('tr-cc-num');
    els.ccCount = $('tr-cc-count');
    els.ccStart = $('tr-cc-start');
    els.ccReset = $('tr-cc-reset');
    els.ccResult = $('tr-cc-result');
    els.earPlay = $('tr-ear-play');
    els.earReplay = $('tr-ear-replay');
    els.earHarm = $('tr-ear-harm');
    els.earScore = $('tr-ear-score');
    els.earStreak = $('tr-ear-streak');
    els.earBestEl = $('tr-ear-best');
    els.earMsg = $('tr-ear-msg');

    ansBtns = Array.prototype.slice.call(root.querySelectorAll('.tr-ear-ans'));

    // restore persisted settings
    var savedA = App.store.get('tr.ccA', 'C');
    var savedB = App.store.get('tr.ccB', 'G');
    els.ccA.value = CC_CHORDS.indexOf(savedA) !== -1 ? savedA : 'C';
    els.ccB.value = CC_CHORDS.indexOf(savedB) !== -1 ? savedB : 'G';
    els.earHarm.checked = !!App.store.get('tr.earHarm', false);
    earBest = App.store.get('tr.earBest', 0);
    if (typeof earBest !== 'number' || !isFinite(earBest)) earBest = 0;

    // card 1 wiring
    els.sessStart.addEventListener('click', sessStart);
    els.sessPause.addEventListener('click', sessPause);
    els.sessFinish.addEventListener('click', sessFinish);
    els.sessClear.addEventListener('click', sessClear);

    // card 2 wiring
    $('tr-pr-key').addEventListener('click', function () {
      setPrompt('Key of ' + keyName(randPc()));
    });
    $('tr-pr-mode').addEventListener('click', function () {
      setPrompt(keyName(randPc()) + ' ' + Theory.SCALES[pick(Theory.SCALE_ORDER)].name);
    });
    $('tr-pr-chord').addEventListener('click', function () {
      setPrompt(randChordName());
    });
    $('tr-pr-chal').addEventListener('click', function () {
      setPrompt(pick(CHALLENGES)());
    });

    // card 3 wiring
    els.ccA.addEventListener('change', function () {
      App.store.set('tr.ccA', els.ccA.value);
      updateBestChip();
    });
    els.ccB.addEventListener('change', function () {
      App.store.set('tr.ccB', els.ccB.value);
      updateBestChip();
    });
    els.ccStart.addEventListener('click', ccStart);
    els.ccReset.addEventListener('click', function () { ccReset(true); });
    els.ccCount.addEventListener('click', ccCount);

    // card 4 wiring
    els.earPlay.addEventListener('click', function () {
      App.getAudio();
      earNewPair();
    });
    els.earReplay.addEventListener('click', function () {
      App.getAudio();
      earSound();
    });
    els.earHarm.addEventListener('change', function () {
      App.store.set('tr.earHarm', els.earHarm.checked);
    });
    ansBtns.forEach(function (btn) {
      btn.addEventListener('click', function () {
        earAnswer(parseInt(btn.getAttribute('data-tr-iv'), 10), btn);
      });
    });

    renderSessions();
    updateBestChip();
    renderEarStats();
    sessButtons();
  }

  function onShow() {
    renderSessions(); // 7-day window may have moved since last visit
  }

  function onHide() {
    // pause (not discard) the session stopwatch
    if (sessRunning) sessPause();
    // cancel a chord-change run in progress
    if (ccRunning) ccReset(true);
    if (ccInt) { clearInterval(ccInt); ccInt = null; }
    // stop ear-trainer timeouts
    if (earNextTO) { clearTimeout(earNextTO); earNextTO = null; }
    for (var i = 0; i < earFlashTOs.length; i++) clearTimeout(earFlashTOs[i]);
    earFlashTOs = [];
    clearAnsClasses();
  }

  function onKey(e) {
    if (e.code === 'Space' || e.key === ' ') {
      if (ccRunning) {
        e.preventDefault();
        if (!e.repeat) ccCount();
      }
    }
  }

  App.register('trainer', {
    init: init,
    onShow: onShow,
    onHide: onHide,
    onKey: onKey
  });
})();
