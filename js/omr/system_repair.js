/* soundLAB OMR: port of homr/system_repair.py (AGPL-3.0, github.com/liebharc/homr).
   Repairs the grouping of staffs into systems before the transcription.

   A layout (Python: tuple of is_grandstaff) is an array of booleans here; layoutKey(layout)
   ('F' / 'T' per staff) stands in for the tuple as a Set / Map key and sorts like the tuple.
   Python keys staffs by id(): Staff objects are Map keys here (identity), and the pairs of
   _possible_grandstaffs are a Set of pairKey(upper, lower). */
(function (G) {
  'use strict';
  var OMR = G.OMR = G.OMR || {};
  var np = OMR.np, py = OMR.py, constants = OMR.constants, model = OMR.model;
  var MultiStaff = model.MultiStaff;
  var eprint = function () { OMR.simple_logging.eprint.apply(null, arguments); };

  // Python's exceptions (OMR.py.error: e.name / e.pyType = the Python type)
  function pyError(type, msg) { return py.error ? py.error(type, msg) : Object.assign(new Error(msg), { name: type, pyType: type }); }
  // id() for staffs: a stable number per object
  var ids = new WeakMap(), nextId = 1;
  function oid(o) {
    var v = ids.get(o);
    if (v === undefined) { v = nextId++; ids.set(o, v); }
    return v;
  }
  function pairKey(upper, lower) { return oid(upper) + ':' + oid(lower); }
  function layoutKey(layout) { return layout.map(function (b) { return b ? 'T' : 'F'; }).join(''); }
  function keyLayout(key) { return key.split('').map(function (c) { return c === 'T'; }); }
  function sumBools(layout) { var n = 0; layout.forEach(function (b) { if (b) n++; }); return n; }

  // collections.Counter over layouts: a Map key -> count in insertion order
  function counter(layouts) {
    var c = new Map();
    (layouts || []).forEach(function (l) { counterAdd(c, l); });
    return c;
  }
  function counterAdd(c, layout) { var k = layoutKey(layout); c.set(k, (c.get(k) || 0) + 1); }
  function counterGet(c, layout) { return c.get(layoutKey(layout)) || 0; }
  // Counter.most_common(n): by count, descending; ties keep the insertion order
  function mostCommonN(c, n) {
    var items = Array.from(c.entries());
    return py.sorted(items, function (e) { return e[1]; }, true).slice(0, n);
  }

  // homr: system_repair.py:15
  function flattenStaffs(staffs) {
    var out = [];
    staffs.forEach(function (multiStaff) { Array.prototype.push.apply(out, multiStaff.staffs); });
    return out;
  }

  // homr: system_repair.py:19
  // The layout of a system: is_grandstaff of each staff.
  function layout(row) { return row.staffs.map(function (staff) { return staff.isGrandstaff; }); }

  // homr: system_repair.py:24
  function isUniform(staffs) {
    return new Set(staffs.map(function (row) { return layoutKey(layout(row)); })).size === 1;
  }

  // homr: system_repair.py:28
  // The most common layout, None if there is none or two are equally common.
  function mostCommon(layouts) {
    if (layouts.size === 0) return null;
    var top = mostCommonN(layouts, 2);
    if (top.length > 1 && top[1][1] === top[0][1]) return null;
    return keyLayout(top[0][0]);
  }

  // homr: system_repair.py:38
  // The gap between two staffs where both have points, None if there is no such x.
  function verticalGap(upper, lower) {
    var upperPoints = new Map();
    upper.grid.forEach(function (point) { upperPoints.set(py.round(point.x), point); });
    var gaps = [];
    lower.grid.forEach(function (point) {
      var x = py.round(point.x);
      if (upperPoints.has(x)) {
        var u = upperPoints.get(x);
        gaps.push(point.y[0] - u.y[u.y.length - 1]);
      }
    });
    return gaps.length ? np.median(gaps) : null;
  }

  function pairwise(list) {
    var out = [];
    for (var i = 0; i + 1 < list.length; i++) out.push([list[i], list[i + 1]]);
    return out;
  }

  // homr: system_repair.py:49
  // Pairs of neighboring single staffs (by id) which can form a grand staff: they
  // overlap and, in unit sizes, are not further apart than the grand staffs on the
  // page. If strict, staffs of different systems must also be closer to each other
  // than to single staffs right above and below, else the pairing is a guess.
  function possibleGrandstaffs(staffs, strict) {
    var flatStaffs = flattenStaffs(staffs);
    var systemOf = new Map();
    staffs.forEach(function (row, i) { row.staffs.forEach(function (staff) { systemOf.set(staff, i); }); });
    var lines = constants.numberOfLinesOnAStaff;
    var grandstaffGaps = [];
    flatStaffs.forEach(function (staff) {
      if (!staff.isGrandstaff) return;
      staff.grid.forEach(function (point) {
        if (point.y.length === 2 * lines) {
          grandstaffGaps.push((point.y[lines] - point.y[lines - 1]) * (lines - 1) / (point.y[lines - 1] - point.y[0]));
        }
      });
    });
    var maxGap = grandstaffGaps.length ? 1.5 * np.median(grandstaffGaps) : Infinity;
    var pairs = pairwise(flatStaffs);
    var measured = pairs.map(function (p) { return verticalGap(p[0], p[1]); });
    // Without overlap, the distance of the bounding boxes is good enough for a comparison
    var gaps = measured.map(function (gap, i) { return gap === null ? pairs[i][1].minY - pairs[i][0].maxY : gap; });
    var result = new Set();
    pairs.forEach(function (p, i) {
      var upper = p[0], lower = p[1], gap = measured[i];
      var unitSize = py.min2(upper.averageUnitSize, lower.averageUnitSize);
      if (upper.isGrandstaff || lower.isGrandstaff || gap === null || gap > maxGap * unitSize) return;
      var neighbors = [i - 1, i + 1].filter(function (j) {
        return j >= 0 && j < gaps.length && !flatStaffs[j].isGrandstaff && !flatStaffs[j + 1].isGrandstaff;
      }).map(function (j) { return gaps[j]; });
      var connected = systemOf.get(upper) === systemOf.get(lower);
      if (!strict || connected || neighbors.every(function (n) { return gap < 0.8 * n; })) result.add(pairKey(upper, lower));
    });
    return result;
  }

  // homr: system_repair.py:92
  // Fits the staffs to the layout. Two single staffs in grandstaffs can form a grand
  // staff, if its brace was missed. Returns None if the staffs don't fit.
  function fitToLayout(staffs, lay, grandstaffs) {
    var result = [], i = 0;
    for (var k = 0; k < lay.length; k++) {
      var isGrandstaff = lay[k];
      if (i < staffs.length && staffs[i].isGrandstaff === isGrandstaff) {
        result.push(staffs[i]);
        i += 1;
      } else if (isGrandstaff && i + 1 < staffs.length && !staffs[i].isGrandstaff && !staffs[i + 1].isGrandstaff &&
                 grandstaffs.has(pairKey(staffs[i], staffs[i + 1]))) {
        result.push(staffs[i].merge(staffs[i + 1]));
        i += 2;
      } else {
        return null;
      }
    }
    return i === staffs.length ? result : null;
  }

  // homr: system_repair.py:119
  // Fits the systems from start on to the layout. Returns the staffs and the next index.
  // Without a grand staff in the layout, only systems with a connected system among
  // them are joined, else nothing tells which single staffs belong together.
  function fitNeighbors(staffs, start, lay, grandstaffs) {
    var anyGrand = lay.some(function (b) { return b; });
    for (var end = start + 1; end < staffs.length + 1; end++) {
      var group = flattenStaffs(staffs.slice(start, end));
      if (group.length > 2 * lay.length) return null;
      if (!anyGrand && group.length === end - start && end - start > 1) continue;
      var fitted = fitToLayout(group, lay, grandstaffs);
      if (fitted !== null) return [fitted, end];
    }
    return null;
  }

  // homr: system_repair.py:142
  // Splits systems which repeat the layout and joins neighbor systems which together
  // have it. Other systems are kept, as the layout can
  // change on a page, e.g. a piano intro before the voice enters. Two single staffs
  // become a grand staff only if they pair up, see _possible_grandstaffs.
  function repairSystemsWith(staffs, lay, strict) {
    var grandstaffs = possibleGrandstaffs(staffs, !!strict);
    var key = layoutKey(lay);
    var result = [], i = 0;
    while (i < staffs.length) {
      if (layoutKey(layout(staffs[i])) === key) {
        result.push(staffs[i]);
        i += 1;
        continue;
      }
      var row = staffs[i].staffs;
      var repeats = py.floorDiv(row.length, lay.length);
      if (repeats > 1 && layoutKey(layout(staffs[i])) === key.repeat(repeats)) {
        for (var k = 0; k < row.length; k += lay.length) result.push(new MultiStaff(row.slice(k, k + lay.length), []));
        i += 1;
        continue;
      }
      var fit = fitNeighbors(staffs, i, lay, grandstaffs);
      if (fit === null) {
        result.push(staffs[i]);
        i += 1;
      } else {
        result.push(new MultiStaff(fit[0], []));
        i = fit[1];
      }
    }
    return result;
  }

  // homr: system_repair.py:177
  // The staves in systems with the layout after the repair. Systems which split a
  // detected system or merge single staffs into a grand staff count half, as they
  // contradict the detection. Joined neighbor systems count fully, as connections are
  // often missed.
  function repairScore(staffs, lay) {
    var systemOf = new Map();
    staffs.forEach(function (row) { row.staffs.forEach(function (staff) { systemOf.set(staff, row); }); });
    var key = layoutKey(lay);
    var score = 0.0;
    repairSystemsWith(staffs, lay, true).forEach(function (row) {
      if (layoutKey(layout(row)) !== key) return;
      var sources = row.staffs.map(function (staff) { return systemOf.has(staff) ? systemOf.get(staff) : null; });
      var contradicts = sources.some(function (source) {
        return source === null || !source.staffs.every(function (s) { return row.staffs.indexOf(s) >= 0; });
      });
      score += (row.staffs.length + sumBools(lay)) * (contradicts ? 0.5 : 1);
    });
    return score;
  }

  // homr: system_repair.py:198
  // The layout most systems share. Systems and neighbor systems which mix single and
  // grand staffs decide, if a layout of them occurs at least twice, as they show how a
  // system is built. Otherwise the layout which repairs the most staves decides, e.g.
  // two single staffs as close as a grand staff whose brace was missed. Layouts of
  // several grand staffs need to be detected twice, as a crease can connect them.
  function commonLayout(staffs) {
    var mixed = counter();
    staffs.forEach(function (row) {
      if (new Set(layout(row)).size > 1) counterAdd(mixed, layout(row));
    });
    pairwise(staffs).forEach(function (p) {
      var pair = layout(p[0]).concat(layout(p[1]));
      var k = layoutKey(pair);
      if (k === 'FT' || k === 'TF') counterAdd(mixed, pair);
    });
    var lay = mostCommon(mixed);
    if (lay !== null && counterGet(mixed, lay) > 1) return lay;
    var counts = counter(staffs.map(layout));
    var keys = new Set(Array.from(counts.keys()).concat(Array.from(mixed.keys())));
    var candidates = Array.from(keys).sort().map(keyLayout).filter(function (l) {
      return !(l.length > 1 && l.every(function (b) { return b; }) && counterGet(counts, l) < 2);
    });
    if (candidates.length === 0) return null;
    return py.max(candidates, function (l) { return [repairScore(staffs, l), counterGet(counts, l)]; });
  }

  // homr: system_repair.py:228
  // On a page of grand staffs, a single staff below the last system is most likely a
  // falsely detected staff. Drops it if it is the only single staff.
  function dropSingleStaffAtEnd(staffs, lay) {
    var single = staffs.filter(function (row) { return layoutKey(layout(row)) === 'F'; });
    var onlyGrandstaffs = lay.indexOf(false) < 0;
    if (!onlyGrandstaffs || !(single.length === 1 && single[0] === staffs[staffs.length - 1]) || staffs.length < 3) return staffs;
    eprint("Removing a single staff below the last system, it doesn't fit the layout");
    return staffs.slice(0, -1);
  }

  // homr: system_repair.py:243
  // Finds the shortest repeating layout of single and grand staffs, e.g. a voice and a
  // piano. Up to one period of other staffs is allowed at each edge of the page.
  // Returns (period, front_trim, back_trim) with the least trim, then the shortest
  // period, or None if the layout doesn't repeat at least twice.
  function findPeriodicCore(flatStaffs) {
    var lay = flatStaffs.map(function (s) { return s.isGrandstaff; });
    var n = lay.length;
    var best = null;
    for (var period = 1; period < py.floorDiv(n, 2) + 1; period++) {
      for (var frontTrim = 0; frontTrim < period + 1; frontTrim++) {
        for (var backTrim = 0; backTrim < period + 1; backTrim++) {
          var core = lay.slice(frontTrim, n - backTrim);
          if (core.length < 2 * period || core.length % period !== 0) continue;
          var first = layoutKey(core.slice(0, period)), same = true;
          for (var i = 0; i < core.length; i += period) if (layoutKey(core.slice(i, i + period)) !== first) { same = false; break; }
          if (!same) continue;
          var candidate = [frontTrim + backTrim, period, frontTrim, backTrim];
          if (best === null || py.cmp(candidate.slice(0, 2), best.slice(0, 2)) < 0) best = candidate;
        }
      }
    }
    if (best === null) return null;
    return [best[1], best[2], best[3]];
  }

  // homr: system_repair.py:271
  // Groups the staffs by a repeating pattern of single and grand staffs. Staffs at the
  // edges which break the pattern stay systems of their own, but only if nothing was
  // grouped before. Returns None if there is no such pattern.
  function regroupByPattern(staffs) {
    var flatStaffs = flattenStaffs(staffs);
    var core = findPeriodicCore(flatStaffs);
    if (core === null) return null;
    var period = core[0], frontTrim = core[1], backTrim = core[2];
    var end = flatStaffs.length - backTrim;
    var pattern = new Set(flatStaffs.slice(frontTrim, frontTrim + period).map(function (staff) { return staff.isGrandstaff; }));
    var mixesSingleAndGrandstaffs = pattern.size === 2;
    var trimmed = frontTrim > 0 || backTrim > 0;
    var nothingGrouped = staffs.every(function (row) { return row.staffs.length === 1; });
    if (!mixesSingleAndGrandstaffs || (trimmed && !nothingGrouped)) return null;
    eprint('Systems repeat every', period, 'staffs, grouping them by this pattern');
    var result = flatStaffs.slice(0, frontTrim).map(function (staff) { return new MultiStaff([staff], []); });
    for (var i = frontTrim; i < end; i += period) result.push(new MultiStaff(flatStaffs.slice(i, i + period), []));
    flatStaffs.slice(end).forEach(function (staff) { result.push(new MultiStaff([staff], [])); });
    return result;
  }

  // homr: system_repair.py:297
  // Merges or splits grand staffs so that the row has the layout. Returns None if a
  // grand staff can't be split or two staffs can't be merged.
  function convertToLayout(row, lay) {
    if (layoutKey(layout(row)) === layoutKey(lay)) return row;
    var singleStaffs = [];
    for (var s = 0; s < row.staffs.length; s++) {
      var staff = row.staffs[s];
      var parts = staff.isGrandstaff ? staff.split() : [staff];
      if (parts === null) return null;
      Array.prototype.push.apply(singleStaffs, parts);
    }
    var at = 0;
    function next() { // next(iterator)
      if (at >= singleStaffs.length) throw pyError('StopIteration', '');
      return singleStaffs[at++];
    }
    var staffs = [];
    for (var k = 0; k < lay.length; k++) {
      var current = next();
      if (lay[k]) {
        var lower = next();
        if (verticalGap(current, lower) === null) return null;
        current = current.merge(lower);
      }
      staffs.push(current);
    }
    return new MultiStaff(staffs, row.connections);
  }

  // homr: system_repair.py:323
  // If every system has the same number of staffs, but in some systems a brace was
  // missed or wrongly found, converts them to the most common layout.
  function unifyGrandStaffs(staffs) {
    var staffsPerSystem = new Set(staffs.map(function (row) {
      var n = 0;
      row.staffs.forEach(function (s) { n += s.isGrandstaff ? 2 : 1; });
      return n;
    }));
    if (staffsPerSystem.size !== 1) return staffs;
    var lay = mostCommon(counter(staffs.map(layout)));
    if (lay === null) return staffs;
    var result = [];
    for (var i = 0; i < staffs.length; i++) {
      var converted = convertToLayout(staffs[i], lay);
      if (converted === null) return staffs;
      result.push(converted);
    }
    return result;
  }

  // homr: system_repair.py:343
  // Repairs the grouping of staffs into systems towards the layout most systems share.
  // Systems with another layout are kept, as the layout can change on a page.
  function ensureSameNumberOfStaffs(staffs) {
    staffs = unifyGrandStaffs(staffs);
    if (isUniform(staffs) && staffs[0].staffs.length > 1) return staffs;
    var lay = commonLayout(staffs);
    var repaired = lay === null ? staffs : repairSystemsWith(staffs, lay);
    if (!isUniform(repaired)) {
      // Nothing grouped, or e.g. a crease connected staffs of different systems
      var regrouped = regroupByPattern(staffs);
      if (regrouped !== null) return regrouped;
    }
    return lay === null ? repaired : dropSingleStaffAtEnd(repaired, lay);
  }

  // homr: system_repair.py:361
  // Repairs the grouping of staffs into systems, see _ensure_same_number_of_staffs.
  function repairSystems(debug, staffs) {
    staffs = ensureSameNumberOfStaffs(staffs);
    eprint('Systems after the repair of the layout:', '[' + staffs.map(function (s) { return s.staffs.length; }).join(', ') + ']');
    debug.writeBoundingBoxesAlternatingColors('systems', staffs);
    return staffs;
  }

  OMR.system_repair = {
    repairSystems: repairSystems,
    // private helpers (Python's _name); staff_parsing uses _layout
    _flattenStaffs: flattenStaffs, _layout: layout, _isUniform: isUniform, _mostCommon: mostCommon,
    _verticalGap: verticalGap, _possibleGrandstaffs: possibleGrandstaffs, _fitToLayout: fitToLayout,
    _fitNeighbors: fitNeighbors, _repairSystems: repairSystemsWith, _repairScore: repairScore,
    _commonLayout: commonLayout, _dropSingleStaffAtEnd: dropSingleStaffAtEnd, _findPeriodicCore: findPeriodicCore,
    _regroupByPattern: regroupByPattern, _convertToLayout: convertToLayout, _unifyGrandStaffs: unifyGrandStaffs,
    _ensureSameNumberOfStaffs: ensureSameNumberOfStaffs,
    // the tuple / id() stand-ins: layoutKey(layout) for sets and dicts of layouts,
    // pairKey(upper, lower) = an entry of _possibleGrandstaffs, counter(layouts) = Counter
    layoutKey: layoutKey, keyLayout: keyLayout, pairKey: pairKey, counter: counter
  };
})(typeof self !== 'undefined' ? self : globalThis);
