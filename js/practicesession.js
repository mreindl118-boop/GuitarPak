/* soundLAB PRACTICE SESSION (prefix ps-, store ps.*; docs/PRACTICE-SESSION.md).
 * NOT a page: one card at the top of Learn > Plan (#ps-card, mounted by
 * practiceplan.js), a countdown chip in the top bar (#ps-chip) while a block
 * runs, and one check-in dialog (#ps-check). Pick the instruments and the
 * minutes; the time is split evenly into parts, one instrument after the
 * other; every block opens the tool it needs, already set up. Voice is the
 * only part that can ride on another instrument ("sing while you play").
 * Keys blocks come from the accepted teacher plan when there is one, so the
 * Plan's measured completion still applies. Nothing here sounds, prompts or
 * switches pages until a block is started by a tap. */
(function () {
  'use strict';
  var ORDER = ['guitar', 'keys', 'bass', 'voice'];
  var NAME = { guitar: 'Guitar', keys: 'Keys', bass: 'Bass', voice: 'Voice' };
  var CAT = { guitar: 'guitar', keys: 'piano', bass: 'bass', voice: 'voice' }; // Learn category that gets the credit
  var HUE = { guitar: 'var(--sl-deg-2, #ff8a52)', keys: 'var(--sl-deg-5, #6fa8ff)', bass: 'var(--sl-deg-6, #b18cff)', voice: 'var(--sl-deg-7, #ff7ac0)' };
  var SUGGEST = [['keys'], ['guitar'], ['keys'], ['keys'], ['bass'], ['guitar'], ['guitar', 'voice']]; // Sun..Sat
  var FOCUS = [[3, 'Locked in'], [2, 'Drifted'], [1, 'Lost it']], FIT = [['easy', 'Too easy'], ['right', 'Just right'], ['hard', 'Too hard']];

  // block: id, title, min (its share), core (kept in short sessions), page,
  // area (what the row says), hint (one line, shown as a toast on launch),
  // optional root / scale / bpm pushed to the shared key + tempo first.
  function B(id, title, min, core, page, area, hint, extra) { return Object.assign({ id: id, title: title, min: min, core: !!core, page: page, area: area, hint: hint }, extra || {}); }
  var SONG = 'Loop the hardest 4 bars at 70% speed. 3 clean times, then speed up.';
  var TEMPLATES = {
    guitar: function (wd) {
      if (wd === 5) return { name: 'Guitar: chords + neck', blocks: [
        B('tune', 'Tune + warm up', 2, 1, 'tuner', 'Tuner', 'Tune all 6 strings. Then frets 1-2-3-4 on every string, slow and even.'),
        B('changes', 'One-minute changes', 7, 1, 'chords', 'Chords', 'Pick 2 chords from a band song. Switch for 1 minute and count the switches.'),
        B('spots', 'Weak spots on the neck', 5, 0, 'quiz', 'Exercises', 'Open the Progress tab and tap your weakest spot on the neck map. Answer by playing.'),
        B('riffB', 'Song part, slow', 6, 0, 'shed', 'Woodshed', SONG),
        B('fun', 'Play for fun', 4, 0, 'jam', 'Jam', 'Play whatever you want. This is the reward.')] };
      return { name: 'Guitar: scales + lead', blocks: [
        B('tune', 'Tune + warm up', 3, 1, 'tuner', 'Tuner', 'Tune all 6 strings. Then frets 1-2-3-4 on every string, slow and even.'),
        B('scale', 'Scale runner', 7, 1, 'fretboard', 'Neck', 'A minor pentatonic at 60. 3 clean runs in a row, then add 4 BPM.', { root: 9, scale: 'minorPent', bpm: 60 }),
        B('riffA', 'Song part, slow', 7, 0, 'shed', 'Woodshed', SONG),
        B('jam', 'Jam over it', 5, 0, 'jam', 'Jam', 'Same scale over the band. Leave space. Repeat a lick you like.', { root: 9, scale: 'minorPent' })] };
    },
    keys: function () { return { name: 'Keys: homework', blocks: [
      B('scale', 'Five-finger + scale', 7, 1, 'piano', 'Piano · Scale lessons', 'Slowest speed. Right hand, left hand, then both.'),
      B('piece', 'Piece: loop 4 bars', 10, 1, 'chart', 'Charts', 'Left hand, right hand, then both. Clean 3 times, then the next 4 bars.'),
      B('read', 'Note reading', 3, 0, 'quiz', 'Exercises', 'One Treble clef or Bass clef level. Look, name, tap.'),
      B('improv', 'Improvise', 5, 0, 'jam', 'Jam', 'Left hand holds the chords. Right hand plays notes that fit.', { root: 2, scale: 'aeolian' })] }; },
    bass: function () { return { name: 'Bass', blocks: [
      B('tune', 'Tune + intonation', 5, 1, 'tuner', 'Tuner', 'Tune up. Then frets 1 to 5 on each string: hold each note until the needle is centered.'),
      B('notes', 'Neck notes', 5, 1, 'quiz', 'Exercises', 'One Fretboard level. Say each note out loud as you play it.'),
      B('groove', 'Groove with the band', 8, 0, 'jam', 'Jam', 'Root on beat 1 with the kick drum. Add the fifth, then a walk-up.'),
      B('song', 'Song bass line, slow', 7, 0, 'shed', 'Woodshed', SONG)] }; },
    voice: function () { return { name: 'Voice', blocks: [
      B('see', 'Sing and see', 8, 1, 'vocal', 'Voice', '5-note scale, then Hold one note until the line is flat and steady.'),
      B('ear', 'Ear training', 5, 1, 'quiz', 'Exercises', 'The next Ear level. Sing the answer before you tap it.'),
      B('line', 'One song line', 7, 0, 'vocal', 'Voice', 'Free mode. Sing one line, record, play it back, fix one thing.')] }; },
    sing: function () { return { name: 'Sing + play', blocks: [
      B('warm', 'Voice warm-up', 4, 0, 'vocal', 'Voice', '5-note scale, then Hold on a comfy note. Easy before loud.'),
      B('part', 'Play the part alone', 6, 1, 'shed', 'Woodshed', 'One verse at 70% speed, until your hands run on autopilot.'),
      B('both', 'Add the singing, slow', 8, 1, 'shed', 'Woodshed', 'Same speed. Hum the melody, then speak the words in rhythm, then sing.'),
      B('full', 'Whole song, gig style', 5, 0, 'shed', 'Woodshed', 'Full speed, start to end. Do not stop for mistakes.')] }; }
  };

  var card = null, chip = null, dlg = null, ticker = null, alarm = null, alarmN = 0, wd0 = null;
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function now() { return Date.now(); }
  function day() { return App.practiceProgress ? App.practiceProgress.dayKey(now()) : new Date().toISOString().slice(0, 10); }
  function weekday() { if (wd0 != null) return wd0; var p = day().split('-'); return new Date(+p[0], p[1] - 1, +p[2]).getDay(); }
  function logs() { var a = App.store.get('ps.log', {}); return a && typeof a === 'object' && !Array.isArray(a) ? a : {}; }
  function rec() { var L = logs()[day()]; return L && Array.isArray(L.picks) && L.blocks ? L : { picks: [], len: 0, sing: 'auto', blocks: {}, win: '' }; }
  function save(L) {
    var all = logs(), keys; all[day()] = L; keys = Object.keys(all).sort();
    while (keys.length > 90) delete all[keys.shift()]; // 90 days, like the Plan's sessions
    App.store.set('ps.log', all);
  }
  function picks(L) { var p = ORDER.filter(function (i) { return (L || rec()).picks.indexOf(i) >= 0; }); return p.length ? p : SUGGEST[weekday()].slice(); }
  // the instrument Voice rides on, or '' (Voice on its own / no Voice)
  function singWith(L) {
    L = L || rec(); var p = picks(L), o = p.filter(function (i) { return i !== 'voice'; });
    if (p.indexOf('voice') < 0 || !o.length || L.sing === '') return '';
    return o.indexOf(L.sing) >= 0 ? L.sing : o[0];
  }
  // Keys blocks = the accepted teacher plan's piano items when there is one
  function teacherBlocks() {
    try {
      var s = App.practicePlan && App.practicePlan.state(); if (!s || !s.plan || !s.plan.acceptedAt) return null;
      var items = s.plan.items.filter(function (i) { var id = i.instrument || s.plan.instrument; return id === 'piano' || id === 'keys' || id === 'synth'; });
      if (!items.length) return null;
      return items.map(function (i, n) { return B('plan-' + i.id, i.title, i.minutes || 5, n < 2, i.page, i.area || 'Plan', i.source || i.title, { planItem: i.id }); });
    } catch (e) { return null; }
  }
  function rawParts(L) {
    var out = [], sw = singWith(L), wd = weekday();
    picks(L).forEach(function (i) {
      if (i === 'voice' && sw) return;
      var t = TEMPLATES[i](wd), tb = i === 'keys' ? teacherBlocks() : null;
      out.push({ inst: i, name: tb ? 'Keys: from your teacher’s notes' : t.name, all: tb || t.blocks, pre: i + '.' });
      if (i === sw) out.push({ inst: 'voice', ride: sw, name: 'Sing + play: ' + NAME[sw], all: TEMPLATES.sing().blocks, pre: 'sing.' });
    });
    return out;
  }
  function natural(L) { return rawParts(L).reduce(function (a, x) { return a + x.all.reduce(function (c, b) { return c + b.min; }, 0); }, 0); }
  function length(L) { L = L || rec(); return Math.max(5 * rawParts(L).length, L.len || App.store.get('ps.len', 0) || natural(L)); }
  // one part's blocks fitted to its minutes: under 12 only the core blocks;
  // every block keeps its share, 2 minutes at least
  function fit(all, T) {
    var bs = T < 12 ? all.filter(function (b) { return b.core; }) : all.slice();
    if (!bs.length) bs = all.slice(0, 1);
    while (bs.length > 1 && bs.length * 2 > T) bs.pop();
    var sum = bs.reduce(function (a, b) { return a + b.min; }, 0);
    var out = bs.map(function (b) { return Object.assign({}, b, { min: Math.max(2, Math.round(T * b.min / sum)) }); });
    var diff = T - out.reduce(function (a, b) { return a + b.min; }, 0), guard = 0;
    while (diff !== 0 && guard++ < 300) {
      var k = 0; out.forEach(function (b, n) { if (b.min > out[k].min) k = n; });
      if (diff < 0 && out[k].min <= 2) break;
      out[k].min += diff > 0 ? 1 : -1; diff += diff > 0 ? -1 : 1;
    }
    return out;
  }
  function parts(L) {
    L = L || rec(); var ps = rawParts(L), T = length(L), base = Math.floor(T / ps.length), extra = T - base * ps.length;
    ps.forEach(function (x, i) {
      x.min = base + (i < extra ? 1 : 0);
      x.blocks = fit(x.all, x.min).map(function (b) { return Object.assign({}, b, { uid: x.pre + b.id, inst: x.inst, ride: x.ride || '' }); });
    });
    return ps;
  }
  function flat(L) { var out = []; parts(L).forEach(function (x) { out = out.concat(x.blocks); }); return out; }
  function find(uid, L) { return flat(L).filter(function (b) { return b.uid === uid; })[0] || null; }
  function isDone(L, uid) { return !!(L.blocks[uid] && L.blocks[uid].done); }
  function nextOpen(L, after) {
    var bs = flat(L), i = after ? bs.map(function (b) { return b.uid; }).indexOf(after) : -1, j;
    for (j = i + 1; j < bs.length; j++) if (!isDone(L, bs[j].uid)) return bs[j];
    for (j = 0; j < i; j++) if (!isDone(L, bs[j].uid)) return bs[j];
    return null;
  }
  function streak() {
    var all = logs(), n = 0, p = day().split('-'), d = new Date(+p[0], p[1] - 1, +p[2]);
    function key(x) { return x.getFullYear() + '-' + ('0' + (x.getMonth() + 1)).slice(-2) + '-' + ('0' + x.getDate()).slice(-2); }
    function any(k) { var L = all[k]; return !!(L && L.blocks && Object.keys(L.blocks).some(function (u) { return L.blocks[u].done; })); }
    if (!any(key(d))) d.setDate(d.getDate() - 1);
    while (any(key(d))) { n++; d.setDate(d.getDate() - 1); }
    return n;
  }

  /* ---------- the running block ---------- */
  // ps.run = { day, uid, total (ms), end (ms epoch while running), left (ms while paused), running, warned }
  function run() { var r = App.store.get('ps.run', null); return r && r.day === day() && find(r.uid) ? r : null; }
  function setRun(r) { App.store.set('ps.run', r); }
  function left(r) { return r ? (r.running ? r.end - now() : r.left) : 0; }
  function fmt(ms) { var s = Math.max(0, Math.ceil(ms / 1000)); return Math.floor(s / 60) + ':' + ('0' + (s % 60)).slice(-2); }
  function launch(b) {
    var cat = CAT[b.ride || b.inst];
    if (App.practiceInstrument && App.practiceInstrument.get() !== cat) App.practiceInstrument.set(cat);
    if (b.planItem && App.practicePlan) App.practicePlan.launch(b.planItem);
    else {
      if (b.bpm) { App.store.set('met.bpm', b.bpm); App.emit('tempo', { bpm: b.bpm, source: 'practicesession' }); }
      if (b.root != null) App.emit('fb:set', { root: b.root, scale: b.scale, source: 'practicesession' });
      if (b.page === 'fretboard' && b.root != null) App.emit('fb:practice', { root: b.root, scale: b.scale, bpm: b.bpm });
      else App.switchTo(b.page);
    }
    try { window.scrollTo(0, 0); } catch (e) { /* no window scroll in tests */ }
    if (App.toast) App.toast(b.title + ': ' + b.hint, 7000);
  }
  function start(uid) {
    var L = rec(), b = find(uid, L); if (!b) return false;
    stopAlarm(); closeCheck();
    L.picks = picks(L); if (!L.len) L.len = length(L); save(L);
    setRun({ day: day(), uid: uid, total: b.min * 60000, end: now() + b.min * 60000, left: b.min * 60000, running: true, warned: false, startedAt: now() });
    App.wake.acquire('ps-run'); arm(); launch(b); paintAll();
    App.emit('ps:state', state());
    return true;
  }
  function pause() { var r = run(); if (!r || !r.running) return; r.left = left(r); r.running = false; setRun(r); App.wake.release('ps-run'); paintAll(); }
  function resume() { var r = run(); if (!r || r.running) return; r.end = now() + r.left; r.running = true; setRun(r); App.wake.acquire('ps-run'); arm(); paintAll(); }
  function addMinute() { var r = run(); if (!r) return; if (r.running) r.end += 60000; else r.left += 60000; r.total += 60000; r.warned = false; setRun(r); paintAll(); }
  function cancel() { stopAlarm(); closeCheck(); setRun(null); App.wake.release('ps-run'); paintAll(); App.emit('ps:state', state()); }
  // the block's time is up, or "I'm done" was pressed: ask the check-in
  function finish(ring) {
    var r = run(); if (!r) return;
    var L = rec(), st = L.blocks[r.uid] || (L.blocks[r.uid] = {});
    st.secs = Math.round((r.total - Math.max(0, left(r))) / 1000); save(L);
    r.running = false; r.left = 0; r.ended = true; setRun(r); App.wake.release('ps-run');
    if (ring) startAlarm();
    openCheck(r.uid); paintAll();
  }
  function checkin(answer) {
    var r = App.store.get('ps.run', null), uid = answer.uid || (r && r.uid); if (!uid) return null;
    var L = rec(), st = L.blocks[uid] || (L.blocks[uid] = {});
    st.focus = answer.focus; st.fit = answer.fit; if (answer.note) st.note = String(answer.note).slice(0, 200);
    st.done = true; st.at = new Date().toISOString(); save(L);
    stopAlarm(); closeCheck(); setRun(null);
    var n = nextOpen(L, uid);
    paintAll(); App.emit('ps:state', state());
    return n;
  }
  function arm() { if (!ticker) ticker = setInterval(tick, 500); }
  function tick() {
    var r = run();
    if (!r || !r.running) { if (!r || r.ended || !r.running) { clearInterval(ticker); ticker = null; } paintChip(); return; }
    var ms = left(r);
    if (!r.warned && ms <= 60000 && r.total > 120000) { r.warned = true; setRun(r); beep(660, 0.25, 0); }
    if (ms <= 0) { finish(true); return; }
    paintChip(); paintClock();
  }

  /* ---------- alarm ---------- */
  function soundOn() { return App.store.get('ps.sound', true) !== false; }
  function beep(f, g, at) {
    if (!soundOn()) return;
    try {
      var ctx = App.getAudio(); if (!ctx || ctx.state !== 'running') return;
      var t = ctx.currentTime + (at || 0), o = ctx.createOscillator(), gn = ctx.createGain();
      o.type = 'triangle'; o.frequency.value = f;
      gn.gain.setValueAtTime(0, t); gn.gain.linearRampToValueAtTime(g, t + 0.02); gn.gain.exponentialRampToValueAtTime(0.001, t + 0.7);
      o.connect(gn); gn.connect(ctx.destination); o.start(t); o.stop(t + 0.8);
    } catch (e) { /* no sound device: the dialog still shows */ }
  }
  function chime() { beep(659.25, 0.4, 0); beep(783.99, 0.4, 0.18); beep(1046.5, 0.4, 0.36); try { if (navigator.vibrate) navigator.vibrate([200, 100, 200]); } catch (e) { /* optional */ } }
  // repeats every 2 s until the check-in is touched; gives up after a minute
  function startAlarm() { stopAlarm(); alarmN = 0; chime(); alarm = setInterval(function () { if (++alarmN > 30) stopAlarm(); else chime(); }, 2000); }
  function stopAlarm() { if (alarm) { clearInterval(alarm); alarm = null; } }

  /* ---------- top-bar chip ---------- */
  function ensureChip() {
    if (chip) return chip;
    var tools = document.getElementById('tabs'); if (!tools) return null;
    chip = document.createElement('button'); chip.type = 'button'; chip.id = 'ps-chip'; chip.className = 'btn sm'; chip.hidden = true;
    chip.addEventListener('click', function () { var r = App.store.get('ps.run', null); if (r && r.ended) openCheck(r.uid); else App.switchTo('practiceplan'); });
    tools.insertBefore(chip, document.getElementById('ctx-btn') || tools.firstChild);
    return chip;
  }
  function paintChip() {
    var c = ensureChip(); if (!c) return;
    var r = App.store.get('ps.run', null), b = r && r.day === day() ? find(r.uid) : null;
    if (!b) { c.hidden = true; return; }
    c.hidden = false;
    var txt = r.ended ? 'Time’s up' : fmt(left(r));
    c.classList.toggle('ps-ended', !!r.ended); c.classList.toggle('ps-paused', !r.running && !r.ended);
    c.textContent = txt;
    var lab = b.title + (r.ended ? ': time is up. Open the check-in.' : ': ' + txt + ' left' + (r.running ? '' : ', paused') + '. Open the session.');
    c.setAttribute('aria-label', lab); c.title = lab;
  }
  function paintClock() { var r = run(), el = card && card.querySelector('#ps-clock'); if (el && r) el.textContent = fmt(left(r)); }

  /* ---------- check-in dialog ---------- */
  function face(v) {
    var m = v === 3 ? 'M9 15c1.6 1.8 4.4 1.8 6 0' : v === 2 ? 'M9 15h6' : 'M9 16c1.6-1.6 4.4-1.6 6 0';
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><circle cx="9" cy="10" r=".6" fill="currentColor"/><circle cx="15" cy="10" r=".6" fill="currentColor"/><path d="' + m + '"/></svg>';
  }
  var pick = {};
  function advice() {
    if (pick.focus === 1) return 'Lost focus happens. Stand up, 3 slow breaths, sip of water.';
    if (pick.fit === 'hard') return 'Next time: drop 10 BPM or one speed level. Slow and clean wins.';
    if (pick.fit === 'easy') return 'Next time: add 4 BPM or go one speed level up.';
    if (pick.focus === 3 && pick.fit === 'right') return 'That is the sweet spot. Keep it there.';
    return '';
  }
  function openCheck(uid) {
    var L = rec(), b = find(uid, L); if (!b) return;
    if (!dlg) {
      dlg = document.createElement('div'); dlg.id = 'ps-check'; dlg.setAttribute('role', 'dialog'); dlg.setAttribute('aria-modal', 'true'); dlg.setAttribute('aria-labelledby', 'ps-check-h');
      document.body.appendChild(dlg);
      dlg.addEventListener('click', onCheckClick);
      dlg.addEventListener('keydown', function (e) {
        if (e.key === 'Escape') { stopAlarm(); closeCheck(); return; }
        if (e.key !== 'Tab') return;
        var f = dlg.querySelectorAll('button:not([disabled]), textarea'), first = f[0], last = f[f.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); } else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      });
    }
    pick = { uid: uid, focus: (L.blocks[uid] || {}).focus || 0, fit: (L.blocks[uid] || {}).fit || '', note: '' };
    var toast = document.getElementById('app-toast'); if (toast) toast.hidden = true; // the block's hint must not cover the answers
    dlg.hidden = false; paintCheck();
    var f = dlg.querySelector('[data-ps-focus]'); if (f) f.focus({ preventScroll: true });
    App.emit('sheet', { name: 'ps-check', open: true });
  }
  function closeCheck() { if (dlg && !dlg.hidden) { dlg.hidden = true; App.emit('sheet', { name: 'ps-check', open: false }); } }
  function paintCheck() {
    var L = rec(), b = find(pick.uid, L), n = nextOpen(L, pick.uid), note = dlg.querySelector('#ps-note'), keep = note ? note.value : '', tip = advice();
    var sw = n && (n.ride || n.inst) !== (b.ride || b.inst);
    dlg.innerHTML = '<div class="ps-sheet"><span class="ps-eyebrow">Check-in</span><h2 id="ps-check-h">' + esc(b.title) + '</h2>' +
      '<p class="ps-q">How was your focus?</p><div class="ps-choice">' + FOCUS.map(function (f) { return '<button type="button" data-ps-focus="' + f[0] + '" aria-pressed="' + (pick.focus === f[0]) + '">' + face(f[0]) + f[1] + '</button>'; }).join('') + '</div>' +
      '<p class="ps-q">How hard was it?</p><div class="ps-choice">' + FIT.map(function (f) { return '<button type="button" data-ps-fit="' + f[0] + '" aria-pressed="' + (pick.fit === f[0]) + '">' + f[1] + '</button>'; }).join('') + '</div>' +
      (tip ? '<p class="ps-tip">' + esc(tip) + '</p>' : '') + (sw ? '<p class="ps-tip"><b>Next is ' + esc(NAME[n.inst]) + '.</b> Put this one down and take a sip of water first.</p>' : '') +
      '<label class="ps-q" for="ps-note">Note (optional: BPM, count, problem)</label><textarea id="ps-note" rows="2" maxlength="200" placeholder="72 BPM clean"></textarea>' +
      '<div class="ps-row"><button type="button" class="btn" id="ps-later">Back to the list</button><button type="button" class="btn primary" id="ps-go"' + (pick.focus && pick.fit ? '' : ' disabled') + '>' + (n ? 'Next: ' + esc(n.title) + ' · ' + n.min + ' min' : 'Finish the session') + '</button></div></div>';
    dlg.querySelector('#ps-note').value = keep;
  }
  function onCheckClick(e) {
    var t = e.target.closest('button'); if (!t) return;
    stopAlarm();
    if (t.hasAttribute('data-ps-focus')) { pick.focus = +t.getAttribute('data-ps-focus'); paintCheck(); dlg.querySelector('[data-ps-focus="' + pick.focus + '"]').focus(); return; }
    if (t.hasAttribute('data-ps-fit')) { pick.fit = t.getAttribute('data-ps-fit'); paintCheck(); dlg.querySelector('[data-ps-fit="' + pick.fit + '"]').focus(); return; }
    if (t.id === 'ps-later' || t.id === 'ps-go') {
      var later = t.id === 'ps-later', n = null;
      if (pick.focus && pick.fit) n = checkin({ uid: pick.uid, focus: pick.focus, fit: pick.fit, note: dlg.querySelector('#ps-note').value.trim() }); else closeCheck();
      if (!later && n) start(n.uid); else App.switchTo('practiceplan');
    }
  }

  /* ---------- the card on Learn > Plan ---------- */
  function paint() {
    if (!card) return;
    var L = rec(), p = picks(L), sw = singWith(L), ps = parts(L), bs = flat(L), T = length(L), r = run(), nb = nextOpen(L, null), done = bs.filter(function (b) { return isDone(L, b.uid); }).length;
    var others = p.filter(function (i) { return i !== 'voice'; }), num = 0, focused = card.contains(document.activeElement) ? document.activeElement : null, key = focused && (focused.id || focused.getAttribute('data-ps-key'));
    var h = '<div class="ps-head"><div><span class="ps-eyebrow">Today’s session</span><h2>What are you practicing?</h2></div><span class="ps-count">' + done + ' / ' + bs.length + ' done' + (streak() ? ' · ' + streak() + '-day streak' : '') + '</span></div>' +
      '<div class="ps-pick" role="group" aria-label="Instruments, pick one or more">' + ORDER.map(function (i) { return '<button type="button" data-ps-inst="' + i + '" data-ps-key="inst-' + i + '" aria-pressed="' + (p.indexOf(i) >= 0) + '" style="--ps-c:' + HUE[i] + '"><i></i>' + NAME[i] + '</button>'; }).join('') + '</div>';
    if (p.indexOf('voice') >= 0 && others.length) h += '<div class="ps-line"><span class="ps-q">Voice</span><div class="ps-chips">' + others.map(function (i) { return '<button type="button" data-ps-sing="' + i + '" data-ps-key="sing-' + i + '" aria-pressed="' + (sw === i) + '">Sing with ' + NAME[i] + '</button>'; }).join('') + '<button type="button" data-ps-sing="" data-ps-key="sing-own" aria-pressed="' + !sw + '">On its own</button></div></div>';
    h += '<div class="ps-line"><span class="ps-q">How long?</span><div class="ps-len"><button type="button" class="ps-step" data-ps-step="-5" data-ps-key="less" aria-label="5 minutes less">−</button><b id="ps-mins">' + T + '<small>min</small></b><button type="button" class="ps-step" data-ps-step="5" data-ps-key="more" aria-label="5 minutes more">+</button></div>' +
      '<div class="ps-chips">' + [10, 15, 20, 30, 45, 60].map(function (m) { return '<button type="button" data-ps-len="' + m + '" data-ps-key="len-' + m + '" aria-pressed="' + (m === T) + '">' + m + '</button>'; }).join('') + '</div></div>';
    if (r) {
      var rb = find(r.uid, L);
      h += '<div class="ps-now"><div><span class="ps-eyebrow">' + (r.ended ? 'Time’s up' : r.running ? 'Now' : 'Paused') + '</span><b>' + esc(rb.title) + '</b></div><span id="ps-clock" class="ps-clock">' + fmt(left(r)) + '</span>' +
        '<div class="ps-row">' + (r.ended ? '<button type="button" class="btn primary" id="ps-open-check">Check in</button>' : '<button type="button" class="btn primary" id="ps-toggle">' + (r.running ? 'Pause' : 'Resume') + '</button><button type="button" class="btn" id="ps-plus">+1 min</button><button type="button" class="btn" id="ps-done">I’m done</button><button type="button" class="btn" id="ps-reopen">Open ' + esc(rb.area) + '</button>') + '</div></div>';
    } else if (nb) h += '<button type="button" class="btn primary ps-start" id="ps-start">Start: ' + esc(nb.title) + ' · ' + nb.min + ' min</button>';
    else h += '<p class="ps-tip"><b>Session done.</b> Nice work. Pick another instrument for a second session, or stop here.</p>';
    if (ps.length > 1) h += '<p class="ps-muted">' + ps.length + ' parts, one after the other: ' + ps.map(function (x) { return x.min + ' min'; }).join(' + ') + '.</p>';
    h += '<details class="ps-list"' + (App.store.get('ps.open', true) ? ' open' : '') + '><summary>' + bs.length + ' blocks</summary>';
    ps.forEach(function (x) {
      h += '<h3 style="--ps-c:' + HUE[x.inst] + '"><i></i>' + esc(x.name) + ' <span>' + x.min + ' min</span></h3><ol>' + x.blocks.map(function (b) {
        num++; var st = L.blocks[b.uid] || {}, cur = r && r.uid === b.uid;
        return '<li class="' + (st.done ? 'ps-done' : '') + (cur ? ' ps-cur' : '') + '"><button type="button" data-ps-open="' + esc(b.uid) + '" data-ps-key="b-' + esc(b.uid) + '" style="--ps-c:' + HUE[b.inst] + '"><span class="ps-n">' + (st.done ? '✓' : num) + '</span><span class="ps-t"><b>' + esc(b.title) + '</b><small>' + esc(b.area) + (st.focus ? ' · ' + FOCUS.filter(function (f) { return f[0] === st.focus; })[0][1] : '') + '</small></span><span class="ps-m">' + b.min + '<small>min</small></span></button></li>';
      }).join('') + '</ol>';
    });
    h += '</details><label class="ps-sound"><input type="checkbox" id="ps-sound"' + (soundOn() ? ' checked' : '') + '> Alarm sound when a block’s time is up</label>';
    card.innerHTML = h;
    if (key) { var again = card.querySelector('#' + key) || card.querySelector('[data-ps-key="' + key + '"]'); if (again) again.focus({ preventScroll: true }); }
  }
  function paintAll() { paint(); paintChip(); }
  function setPicks(p) { var L = rec(); L.picks = ORDER.filter(function (i) { return p.indexOf(i) >= 0; }); if (!L.picks.length) return false; save(L); guardRun(); paintAll(); return true; }
  function setSing(v) { var L = rec(); L.picks = picks(L); L.sing = v; save(L); guardRun(); paintAll(); }
  function setLen(m) { var L = rec(); L.picks = picks(L); L.len = Math.max(5 * rawParts(L).length, Math.min(120, Math.round(m))); save(L); App.store.set('ps.len', L.len); paintAll(); }
  function guardRun() { var r = App.store.get('ps.run', null); if (r && !find(r.uid)) cancel(); } // the running block was picked away
  function onCardClick(e) {
    var t = e.target.closest('button'); if (!t) return;
    var L = rec(), p = picks(L), a;
    if ((a = t.getAttribute('data-ps-inst'))) { var k = p.indexOf(a); if (k >= 0) { if (p.length === 1) { if (App.toast) App.toast('Keep at least one instrument.'); return; } p.splice(k, 1); } else p.push(a); setPicks(p); return; }
    if (t.hasAttribute('data-ps-sing')) { setSing(t.getAttribute('data-ps-sing')); return; }
    if ((a = t.getAttribute('data-ps-len'))) { setLen(+a); return; }
    if ((a = t.getAttribute('data-ps-step'))) { var c = length(L); setLen(+a > 0 ? Math.floor(c / 5) * 5 + 5 : Math.ceil(c / 5) * 5 - 5); return; }
    if ((a = t.getAttribute('data-ps-open'))) { start(a); return; }
    if (t.id === 'ps-start') { var nb = nextOpen(L, null); if (nb) start(nb.uid); return; }
    if (t.id === 'ps-toggle') { var r = run(); if (r && r.running) pause(); else resume(); return; }
    if (t.id === 'ps-plus') { addMinute(); return; }
    if (t.id === 'ps-done') { finish(false); return; }
    if (t.id === 'ps-open-check') { var rr = App.store.get('ps.run', null); if (rr) openCheck(rr.uid); return; }
    if (t.id === 'ps-reopen') { var r2 = run(), b = r2 && find(r2.uid); if (b) launch(b); }
  }
  function mount(box) {
    card = box; App.injectCSS('practicesession', CSS);
    box.addEventListener('click', onCardClick);
    box.addEventListener('change', function (e) { if (e.target.id === 'ps-sound') { App.store.set('ps.sound', e.target.checked); if (e.target.checked) beep(880, 0.15, 0); } });
    box.addEventListener('toggle', function (e) { if (e.target.classList && e.target.classList.contains('ps-list')) App.store.set('ps.open', e.target.open); }, true);
    paintAll();
  }
  function state() {
    var L = rec(), r = run();
    return JSON.parse(JSON.stringify({ day: day(), picks: picks(L), sing: singWith(L), minutes: length(L), parts: parts(L).map(function (x) { return { inst: x.inst, name: x.name, min: x.min, blocks: x.blocks }; }), log: L, run: r ? Object.assign({}, r, { leftMs: left(r) }) : null, streak: streak() }));
  }
  function boot() {
    App.injectCSS('practicesession', CSS);
    var r = App.store.get('ps.run', null);
    if (r && r.day !== day()) { setRun(null); r = null; }
    // a reload never restarts sound or the clock by itself: a running block comes back paused
    if (r && r.running) { r.left = Math.max(0, r.end - now()); r.running = false; setRun(r); }
    paintChip();
    App.on('practiceplan:shown', paintAll);
    document.addEventListener('visibilitychange', function () { if (!document.hidden) { tick(); paintAll(); } });
  }

  var CSS = '#ps-card{display:grid;gap:var(--sl-space-3,12px)}#ps-card h2{margin:0}.ps-head{display:flex;justify-content:space-between;align-items:flex-end;gap:12px;flex-wrap:wrap}.ps-eyebrow{display:block;font-size:12px;text-transform:uppercase;letter-spacing:1.2px;color:var(--sl-accent,var(--accent))}.ps-count,.ps-muted{font-size:14px;color:var(--sl-ink-muted,var(--muted));margin:0}' +
    '.ps-pick{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px}.ps-pick button,.ps-chips button,.ps-choice button{font:inherit;color:inherit;cursor:pointer;min-height:var(--sl-tap-min,44px);border:1.5px solid var(--sl-line,var(--line));background:var(--sl-surface-2,var(--inset));border-radius:var(--sl-radius-md,10px);font-weight:600;min-width:0}' +
    '.ps-pick button{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;padding:8px 4px}.ps-pick i,.ps-list h3 i{width:12px;height:12px;border-radius:50%;background:var(--ps-c);display:inline-block;flex:none}.ps-pick button[aria-pressed="true"]{border-color:var(--ps-c);box-shadow:0 0 0 2px var(--ps-c) inset}' +
    '.ps-line{display:grid;gap:8px}.ps-q{font-size:12px;text-transform:uppercase;letter-spacing:1.2px;color:var(--sl-ink-muted,var(--muted));margin:0}.ps-chips{display:flex;gap:6px;flex-wrap:wrap}.ps-chips button{flex:1 1 44px;padding:6px 10px;font-variant-numeric:tabular-nums}.ps-chips button[aria-pressed="true"],.ps-choice button[aria-pressed="true"]{border-color:var(--sl-accent,var(--accent));background:var(--sl-accent-soft,var(--accent-soft))}' +
    '.ps-len{display:flex;align-items:center;justify-content:space-between;gap:12px;border:1px solid var(--sl-line,var(--line));border-radius:var(--sl-radius-md,10px);padding:6px;background:var(--sl-surface-2,var(--inset))}.ps-len b{font-family:var(--sl-font-display,inherit);font-weight:400;font-size:40px;line-height:1;font-variant-numeric:tabular-nums;display:flex;align-items:baseline;gap:6px}.ps-len small,.ps-m small{font-family:var(--sl-font-body,inherit);font-size:11px;letter-spacing:1px;text-transform:uppercase;color:var(--sl-ink-muted,var(--muted))}' +
    '.ps-step{width:52px;height:52px;border-radius:var(--sl-radius-md,10px);border:0;background:var(--sl-accent,var(--accent));color:var(--sl-accent-ink,#1a1206);font-size:28px;font-weight:700;line-height:1;cursor:pointer}.ps-start{min-height:52px;font-size:17px;width:100%}' +
    '.ps-now{display:grid;grid-template-columns:1fr auto;gap:8px 12px;align-items:center;border:2px solid var(--sl-accent,var(--accent));border-radius:var(--sl-radius-md,10px);padding:12px}.ps-now b{font-size:18px}.ps-clock{font-family:var(--sl-font-display,inherit);font-size:44px;line-height:1;font-variant-numeric:tabular-nums}.ps-row{grid-column:1/-1;display:flex;gap:8px;flex-wrap:wrap}.ps-row .btn{flex:1 1 auto;min-height:var(--sl-tap-min,44px)}' +
    '.ps-tip{margin:0;border-left:4px solid var(--sl-accent,var(--accent));background:var(--sl-accent-soft,var(--accent-soft));padding:8px 12px;border-radius:0 8px 8px 0}.ps-list summary{cursor:pointer;font-weight:600}.ps-list h3{display:flex;align-items:center;gap:8px;margin:14px 0 6px;font-size:19px}.ps-list h3 span{margin-left:auto;font-family:var(--sl-font-body,inherit);font-size:13px;color:var(--sl-ink-muted,var(--muted))}.ps-list ol{list-style:none;margin:0;padding:0;display:grid;gap:6px}' +
    '.ps-list li button{font:inherit;color:inherit;cursor:pointer;width:100%;text-align:left;display:grid;grid-template-columns:36px 1fr auto;gap:10px;align-items:center;background:var(--sl-surface-2,var(--inset));border:1px solid var(--sl-line,var(--line));border-radius:var(--sl-radius-md,10px);padding:8px 10px;min-height:52px}.ps-n{width:32px;height:32px;border-radius:50%;border:2px solid var(--ps-c);display:grid;place-items:center;font-weight:700}.ps-done .ps-n{background:var(--sl-ok,#5fd08a);border-color:var(--sl-ok,#5fd08a);color:var(--sl-bg,#131114)}.ps-done .ps-t b{text-decoration:line-through}.ps-cur button{border-color:var(--sl-accent,var(--accent));box-shadow:0 0 0 1px var(--sl-accent,var(--accent)) inset}.ps-t{min-width:0;display:grid}.ps-t small{font-size:13px;color:var(--sl-ink-muted,var(--muted))}.ps-m{font-family:var(--sl-font-display,inherit);font-size:24px;line-height:1;text-align:right;font-variant-numeric:tabular-nums;display:grid}' +
    '.ps-sound{display:flex;align-items:center;gap:10px;font-size:14px}.ps-sound input{width:20px;height:20px;accent-color:var(--sl-accent,var(--accent))}' +
    '#ps-chip{font-variant-numeric:tabular-nums;font-weight:700;border-color:var(--sl-accent,var(--accent));color:var(--sl-accent,var(--accent));padding:0 10px;white-space:nowrap}#ps-chip.ps-paused{opacity:.65}#ps-chip.ps-ended{background:var(--sl-accent,var(--accent));color:var(--sl-accent-ink,#1a1206)}#ps-chip[hidden]{display:none}' +
    '#ps-check{position:fixed;inset:0;z-index:var(--sl-z-sheet,40);background:var(--sl-overlay,rgba(0,0,0,.6));display:grid;place-items:center;padding:16px;overflow:auto}#ps-check[hidden]{display:none}.ps-sheet{width:min(460px,100%);background:var(--sl-surface,var(--card));color:var(--sl-ink,var(--text));border:1px solid var(--sl-line,var(--line));border-radius:var(--sl-radius-lg,16px);padding:18px;display:grid;gap:10px;box-shadow:var(--sl-shadow-2,0 12px 40px rgba(0,0,0,.4))}.ps-sheet h2{margin:0}.ps-choice{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}.ps-choice button{display:flex;flex-direction:column;align-items:center;gap:4px;padding:10px 4px}.ps-choice svg{width:28px;height:28px}.ps-sheet textarea{font:inherit;color:inherit;background:var(--sl-surface-2,var(--inset));border:1px solid var(--sl-line,var(--line));border-radius:8px;padding:8px;width:100%;box-sizing:border-box;resize:vertical}.ps-sheet .ps-row .btn[disabled]{opacity:.5}' +
    '@media(max-width:600px){.ps-pick{grid-template-columns:repeat(2,minmax(0,1fr))}.ps-clock{font-size:36px}}';

  App.practiceSession = {
    mount: mount, state: state, setPicks: setPicks, setSing: setSing, setLength: setLen, start: start, pause: pause, resume: resume, addMinute: addMinute, finish: finish, checkin: checkin, cancel: cancel, repaint: paintAll,
    // test hooks: pin the weekday, jump the running clock
    _weekday: function (n) { wd0 = n; paintAll(); }, _skip: function (ms) { var r = run(); if (r && r.running) { r.end -= ms; setRun(r); tick(); } }, _fit: fit
  };
  window.SLSession = App.practiceSession;
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
