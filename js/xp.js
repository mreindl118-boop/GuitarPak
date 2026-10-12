/* soundLAB XP — the lesson game layer over Exercises (Duolingo-style):
 * XP and player levels, a daily XP goal, a day streak with streak freezes,
 * practice time, per-unit answer speed, and 60-second sprint records.
 * No DOM except one class on <html> (goal-due: today's goal not met yet).
 *
 * Stores (App.store → localStorage 'guitarlab.*'):
 *   xp.total   lifetime XP
 *   xp.days    { 'YYYY-MM-DD': { x: XP, s: seconds practiced, q: answered,
 *                k: correct, l: levels finished, u: { unitId: [ok, ms, asked] } } }
 *              (u = correct answers, their summed answer time, and all
 *              answers per unit; kept ~180 days)
 *   xp.goal    daily XP goal: 20 | 50 | 100 | 150
 *   xp.freeze  streak freezes banked (0..2) · xp.frozen [day keys they covered]
 *   xp.fzAt    day a freeze was last earned · xp.best best streak
 *   xp.sprint  { key: best correct answers in 60 s }
 *   xp.jump    furthest path node opened by a jump test (-1 = none)
 *
 * Bus: emits 'xp' {total, today, goal, gained} after every change.
 */
(function () {
  'use strict';

  var GOALS = [20, 50, 100, 150];
  var GOAL_NAMES = { 20: 'Casual', 50: 'Regular', 100: 'Serious', 150: 'Intense' };
  var PAR = { choice: 4000, ear: 6500, play: 9000 }; // fast-answer bonus thresholds (ms)
  var KEEP_DAYS = 180;

  var now = function () { return new Date(); }; // tests override via SLXP._now

  function pad(n) { return n < 10 ? '0' + n : '' + n; }
  function dayKey(d) { d = d || now(); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function fromKey(k) { var p = k.split('-'); return new Date(+p[0], +p[1] - 1, +p[2], 12); }
  function addDays(k, n) { var d = fromKey(k); d.setDate(d.getDate() + n); return dayKey(d); }

  function get(key, def) { var v = App.store.get(key, def); return v == null ? def : v; }
  function set(key, v) { App.store.set(key, v); }

  var days = null;
  function D() {
    if (!days) { days = get('xp.days', {}); if (!days || typeof days !== 'object') days = {}; }
    return days;
  }
  function day(k) {
    var all = D();
    k = k || dayKey();
    if (!all[k]) all[k] = { x: 0, s: 0, q: 0, k: 0, l: 0, u: {} };
    return all[k];
  }
  function peek(k) { return D()[k] || null; }
  function prune() {
    var all = D(), cut = addDays(dayKey(), -KEEP_DAYS);
    Object.keys(all).forEach(function (k) { if (k < cut) delete all[k]; });
  }
  function saveDays() { prune(); set('xp.days', D()); }

  function total() { return Math.max(0, Math.round(+get('xp.total', 0) || 0)); }
  function goal() { var g = +get('xp.goal', 50); return GOALS.indexOf(g) >= 0 ? g : 50; }

  // first run: existing course progress turns into a starting XP balance
  function seed() {
    if (App.store.get('xp.total', null) != null) return;
    var p = App.store.get('qz.prog', {}), t = 0;
    if (p && typeof p === 'object') Object.keys(p).forEach(function (id) { if (p[id] && p[id].s) t += 10 + (p[id].s === 3 ? 5 : 0); });
    set('xp.total', t);
  }

  // ---- player level: 40 XP to reach Lv 2, then +20 more per level ----
  var TITLES = [[1, 'Beginner'], [3, 'Learner'], [6, 'Player'], [10, 'Musician'], [15, 'Pro'], [20, 'Maestro']];
  function levelOf(xp) {
    var lv = 1, need = 40, rest = xp;
    while (rest >= need) { rest -= need; lv++; need = 40 + 20 * (lv - 1); }
    var title = TITLES[0][1];
    TITLES.forEach(function (t) { if (lv >= t[0]) title = t[1]; });
    return { lv: lv, into: rest, need: need, title: title };
  }

  // ---- streak: a day counts once a level is finished in it ----
  function active(k) { var d = peek(k); return !!(d && d.l > 0); }
  function frozenList() { var f = get('xp.frozen', []); return Array.isArray(f) ? f : []; }
  function covered(k) { return active(k) || frozenList().indexOf(k) >= 0; }

  // Missed days after a living streak are covered by banked freezes — one
  // per day, and only when there are enough to bridge the whole gap.
  function settle() {
    var t = dayKey(), k = addDays(t, -1), missed = [];
    for (var i = 0; i < 60 && !covered(k); i++) { missed.push(k); k = addDays(k, -1); }
    if (!missed.length || !covered(k)) return;
    var fz = +get('xp.freeze', 0) || 0;
    if (missed.length > fz) return;
    set('xp.frozen', frozenList().concat(missed).slice(-30));
    set('xp.freeze', fz - missed.length);
  }

  function streak() {
    settle();
    var t = dayKey(), today = active(t), n = 0, k = today ? t : addDays(t, -1);
    for (var i = 0; i < 400 && covered(k); i++) { if (active(k)) n++; k = addDays(k, -1); }
    var best = Math.max(+get('xp.best', 0) || 0, n);
    return { n: n, today: today, best: best, freezes: +get('xp.freeze', 0) || 0 };
  }

  function changed(gained) {
    var t = day(), g = goal();
    if (document.documentElement) document.documentElement.classList.toggle('goal-due', total() > 0 && t.x < g);
    App.emit('xp', { total: total(), today: t.x, goal: g, gained: gained || 0 });
  }

  function addXP(n) {
    if (!n) return;
    set('xp.total', total() + n);
    day().x += n;
  }

  // one answered question. kind: 'choice' | 'ear' | 'play'
  function answer(o) {
    var t = day(), ms = Math.max(0, Math.min(o.ms || 0, 45000));
    t.q++;
    t.s += ms / 1000;
    var gained = 0, fast = false, u = null;
    if (o.unit) { u = t.u[o.unit] || (t.u[o.unit] = [0, 0, 0]); u[2] = (u[2] || 0) + 1; }
    if (o.ok) {
      t.k++;
      fast = ms > 0 && ms < (PAR[o.kind] || PAR.choice);
      gained = 2 + (fast ? 1 : 0) + ((o.combo || 0) >= 5 ? 1 : 0);
      if (u) { u[0]++; u[1] += Math.min(ms, 30000); }
    }
    addXP(gained);
    saveDays();
    changed(gained);
    return { xp: gained, fast: fast };
  }

  // a finished level (or sprint): bonuses, the streak day, freezes
  function finishLevel(o) {
    var t = day(), before = t.x, wasActive = t.l > 0;
    t.l++;
    var bonus = (o.passed ? 5 : 0) + (o.perfect ? 5 : 0) + (o.record ? 5 : 0);
    addXP(bonus);
    saveDays();
    var st = streak(), earned = false;
    if (st.n > (+get('xp.best', 0) || 0)) set('xp.best', st.n);
    if (!wasActive && st.n > 0 && st.n % 7 === 0 && get('xp.fzAt', '') !== dayKey() && (+get('xp.freeze', 0) || 0) < 2) {
      set('xp.freeze', (+get('xp.freeze', 0) || 0) + 1);
      set('xp.fzAt', dayKey());
      earned = true;
    }
    var g = goal();
    changed(bonus);
    return { bonus: bonus, goalHit: before < g && t.x >= g, streak: st.n, extended: !wasActive, freezeEarned: earned };
  }

  function setGoal(g) { if (GOALS.indexOf(+g) >= 0) { set('xp.goal', +g); changed(0); } }

  function history(n) {
    var out = [], k = addDays(dayKey(), -(n - 1));
    for (var i = 0; i < n; i++) {
      var d = peek(k) || { x: 0, s: 0, q: 0, k: 0, l: 0, u: {} };
      out.push({ key: k, x: d.x, s: d.s, q: d.q, k: d.k, l: d.l, frozen: frozenList().indexOf(k) >= 0 });
      k = addDays(k, 1);
    }
    return out;
  }

  // average ms per correct answer over [from, to) day keys — for one unit id,
  // an array of unit ids (a topic), or everything (unit falsy)
  function speed(unit, fromK, toK) {
    var n = 0, ms = 0, all = D(), only = unit ? (Array.isArray(unit) ? unit : [unit]) : null;
    Object.keys(all).forEach(function (k) {
      if ((fromK && k < fromK) || (toK && k >= toK)) return;
      var u = all[k].u || {};
      Object.keys(u).forEach(function (id) {
        if (only && only.indexOf(id) < 0) return;
        n += u[id][0];
        ms += u[id][1];
      });
    });
    return { n: n, avg: n ? ms / n : 0 };
  }

  // weekly speed for the trend chart (oldest first)
  function speedWeeks(w, unit) {
    var out = [], end = addDays(dayKey(), 1);
    for (var i = w - 1; i >= 0; i--) {
      var to = addDays(end, -7 * i), from = addDays(to, -7);
      var s = speed(unit, from, to);
      out.push({ from: from, to: addDays(to, -1), n: s.n, avg: s.avg });
    }
    return out;
  }

  function totals() {
    var all = D(), t = { q: 0, k: 0, s: 0, l: 0, days: 0 };
    Object.keys(all).forEach(function (k) {
      var d = all[k];
      t.q += d.q; t.k += d.k; t.s += d.s; t.l += d.l;
      if (d.l > 0) t.days++;
    });
    return t;
  }

  // answers / correct per unit over all kept days
  function unitStats() {
    var out = {}, all = D();
    Object.keys(all).forEach(function (k) {
      var u = all[k].u || {};
      Object.keys(u).forEach(function (id) {
        var o = out[id] || (out[id] = { ok: 0, asked: 0, ms: 0 });
        o.ok += u[id][0]; o.ms += u[id][1]; o.asked += u[id][2] || u[id][0];
      });
    });
    return out;
  }

  function sprintBest(key) { var s = get('xp.sprint', {}); return (s && s[key]) || 0; }
  function sprintRecord(key, score) {
    var s = get('xp.sprint', {});
    if (!s || typeof s !== 'object') s = {};
    var old = s[key] || 0, isBest = score > old;
    if (isBest) { s[key] = score; set('xp.sprint', s); }
    return { best: Math.max(old, score), old: old, isBest: isBest };
  }

  function jumpIdx() { var j = +get('xp.jump', -1); return isNaN(j) ? -1 : j; }
  function setJump(i) { if (i > jumpIdx()) set('xp.jump', i); }

  seed();

  window.SLXP = App.xp = {
    GOALS: GOALS, GOAL_NAMES: GOAL_NAMES,
    total: total, goal: goal, setGoal: setGoal, level: function () { return levelOf(total()); }, levelOf: levelOf,
    today: function () { var d = peek(dayKey()); return d || { x: 0, s: 0, q: 0, k: 0, l: 0, u: {} }; },
    streak: streak, answer: answer, finishLevel: finishLevel, history: history,
    speed: speed, speedWeeks: speedWeeks, totals: totals, unitStats: unitStats,
    sprintBest: sprintBest, sprintRecord: sprintRecord, jump: jumpIdx, setJump: setJump,
    sprints: function () { var o = get('xp.sprint', {}); return o && typeof o === 'object' ? o : {}; },
    dayKey: dayKey, addDays: addDays,
    refresh: function () { changed(0); },
    // tests: pin the clock, drop the cache
    _now: function (fn) { now = fn || function () { return new Date(); }; },
    _reload: function () { days = null; }
  };

  // paint the Learn-tab dot once the shell exists
  setTimeout(function () { try { changed(0); } catch (e) { /* shell not ready */ } }, 0);
})();
