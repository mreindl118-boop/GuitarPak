/* soundLAB OMR: port of homr/model.py (AGPL-3.0, github.com/liebharc/homr).
   The page's symbols and staffs. Points / centers are [x, y]; transformations are functions
   [x, y] -> [x, y] (see point_mapping.js). Enum members are frozen {name, value} objects. */
(function (G) {
  'use strict';
  var OMR = G.OMR = G.OMR || {};
  var np = OMR.np, py = OMR.py, constants = OMR.constants, bb = OMR.bounding_boxes;
  var DebugDrawable = bb.DebugDrawable, RotatedBoundingBox = bb.RotatedBoundingBox;
  var cv2 = function () { return OMR.cv2; };

  function makeEnum(name, members, strs) {
    var e = {};
    Object.keys(members).forEach(function (k) {
      e[k] = Object.freeze({ name: k, value: members[k], enum: name, toString: function () { return strs ? strs[k] : name + '.' + k; } });
    });
    return Object.freeze(e);
  }

  // homr: model.py:20
  class InputPredictions {
    constructor(original, preprocessed, notehead, symbols, staff, clefsKeys, stemsRest) {
      this.original = original;
      this.preprocessed = preprocessed;
      this.notehead = notehead;
      this.symbols = symbols;
      this.staff = staff;
      this.stemsRest = stemsRest;
      this.clefsKeys = clefsKeys;
    }
  }

  // drawable data of a symbol: its box plus a text label (putText in Python)
  function labelled(items, text, at, color) {
    items.push({ type: 'text', text: text, x: at[0], y: at[1], color: color, css: bb.cssColor(color) });
    return items;
  }

  // homr: model.py:40
  class SymbolOnStaff extends DebugDrawable {
    constructor(center) { super(); this.center = center; }
    copy() { throw new Error('copy is abstract'); }
    // homr: model.py:48
    transformCoordinates(transformation) {
      var copy = this.copy();
      copy.center = transformation(this.center);
      return copy;
    }
  }

  // homr: model.py:56
  class Accidental extends SymbolOnStaff {
    constructor(box, position) { super(box.center); this.box = box; this.position = position; }
    drawOntoImage(img, color) {
      color = color || [255, 0, 0];
      this.box.drawOntoImage(img, color);
      cv2().putText(img, 'accidental-' + this.position, [py.int(this.box.box[0]), py.int(this.box.box[1])], cv2().FONT_HERSHEY_SIMPLEX, 1, color, 2, cv2().LINE_AA);
    }
    toDrawable(color) {
      color = color || [255, 0, 0];
      return labelled(this.box.toDrawable(color), 'accidental-' + this.position, [py.int(this.box.box[0]), py.int(this.box.box[1])], color);
    }
    toString() { return 'Accidental(' + py.repr(this.center) + ')'; }
    copy() { return new Accidental(this.box, this.position); }
  }

  // homr: model.py:85
  class Rest extends SymbolOnStaff {
    constructor(box) { super(box.center); this.box = box; this.hasDot = false; }
    drawOntoImage(img, color) {
      color = color || [255, 0, 0];
      this.box.drawOntoImage(img, color);
      cv2().putText(img, 'rest', [py.int(this.box.box[0]), py.int(this.box.box[1])], cv2().FONT_HERSHEY_SIMPLEX, 1, color, 2, cv2().LINE_AA);
    }
    toDrawable(color) {
      color = color || [255, 0, 0];
      return labelled(this.box.toDrawable(color), 'rest', [py.int(this.box.box[0]), py.int(this.box.box[1])], color);
    }
    toString() { return 'Rest(' + py.repr(this.center) + ')'; }
    copy() { return new Rest(this.box); }
  }

  // homr: model.py:114
  var StemDirection = makeEnum('StemDirection', { UP: 1, DOWN: 2 });
  // homr: model.py:119 (str(): O / *)
  var NoteHeadType = makeEnum('NoteHeadType', { HOLLOW: 1, SOLID: 2 }, { HOLLOW: 'O', SOLID: '*' });

  var noteNames = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];

  // homr: model.py:135
  class Note extends SymbolOnStaff {
    constructor(box, position, stem, stemDirection) {
      super(box.center);
      this.box = box;
      this.position = position;
      this.hasDot = false;
      this.stem = stem;
      this.circleOfFifth = 0;
      this.stemDirection = stemDirection;
      this.beams = [];
      this.flags = [];
    }
    drawOntoImage(img, color) {
      color = color || [255, 0, 0];
      this.box.drawOntoImage(img, color);
      var dot = this.hasDot ? '.' : '';
      cv2().putText(img, 'note' + dot + this.position, [py.int(this.box.center[0]), py.int(this.box.center[1])], cv2().FONT_HERSHEY_SIMPLEX, 1, color, 2, cv2().LINE_AA);
      if (this.stem !== null && this.stem !== undefined) this.stem.drawOntoImage(img, color);
      this.beams.forEach(function (b) { b.drawOntoImage(img, color); });
      this.flags.forEach(function (f) { f.drawOntoImage(img, color); });
    }
    toDrawable(color) {
      color = color || [255, 0, 0];
      var items = labelled(this.box.toDrawable(color), 'note' + (this.hasDot ? '.' : '') + this.position, [py.int(this.box.center[0]), py.int(this.box.center[1])], color);
      if (this.stem !== null && this.stem !== undefined) Array.prototype.push.apply(items, this.stem.toDrawable(color));
      this.beams.concat(this.flags).forEach(function (b) { Array.prototype.push.apply(items, b.toDrawable(color)); });
      return items;
    }
    toString() { return 'Note(' + py.repr(this.center) + ', ' + this.position + ')'; }
    copy() { return new Note(this.box, this.position, this.stem, this.stemDirection); }
  }

  // homr: model.py:183
  class BarLine extends SymbolOnStaff {
    constructor(box) { super(box.center); this.box = box; }
    drawOntoImage(img, color) { this.box.drawOntoImage(img, color || [255, 0, 0]); }
    toDrawable(color) { return this.box.toDrawable(color || [255, 0, 0]); }
    toString() { return 'BarLine(' + py.repr(this.center) + ')'; }
    copy() { return new BarLine(this.box); }
  }

  // homr: model.py:201
  class Clef extends SymbolOnStaff {
    constructor(box) { super(box.center); this.box = box; }
    drawOntoImage(img, color) {
      color = color || [255, 0, 0];
      this.box.drawOntoImage(img, color);
      cv2().putText(img, 'clef', [this.box.box[0], this.box.box[1]], cv2().FONT_HERSHEY_SIMPLEX, 1, color, 2, cv2().LINE_AA);
    }
    toDrawable(color) {
      color = color || [255, 0, 0];
      return labelled(this.box.toDrawable(color), 'clef', [this.box.box[0], this.box.box[1]], color);
    }
    toString() { return 'Clef(' + py.repr(this.center) + ')'; }
    copy() { return new Clef(this.box); }
  }

  // homr: model.py:229
  class StaffPoint {
    constructor(x, y, angle) {
      if (y.length % constants.numberOfLinesOnAStaff !== 0) throw py.error('Exception', 'A staff must consist of 5, 10, ... lines');
      this.x = x;
      this.y = y;
      this.angle = angle;
      this.averageUnitSize = np.mean(np.diff(y));
    }
    // homr: model.py:238
    merge(other) {
      if (Math.abs(this.x - other.x) > 1e-3) throw py.error('ValueError', "Can't merge points at different positions");
      var y = this.y.concat(other.y);
      var angle = (this.angle + other.angle) / 2;
      return new StaffPoint(this.x, py.sorted(y), angle);
    }
    // homr: model.py:247
    findPositionInUnitSizes(box) {
      var center = box.center, self = this;
      var idxOfClosestY = np.argmin(this.y.map(function (yv) { return Math.abs(yv - center[1]); }));
      var distance = this.y[idxOfClosestY] - center[1];
      var distanceInUnitSizes = py.round(2 * distance / this.averageUnitSize);
      return 2 * (self.y.length - idxOfClosestY) + distanceInUnitSizes - 1;
    }
    // homr: model.py:255
    transformCoordinates(transformation) {
      var self = this;
      var xy = this.y.map(function (yv) { return transformation([self.x, yv]); });
      var averageX = np.mean(xy.map(function (p) { return p[0]; }));
      return new StaffPoint(averageX, xy.map(function (p) { return p[1]; }), this.angle);
    }
    // homr: model.py:262
    toBoundingBox() {
      return new bb.BoundingBox([py.int(this.x), py.int(this.y[0]), py.int(this.x), py.int(this.y[this.y.length - 1])], new Float64Array(0), -2);
    }
    toString() { return 'P(' + py.repr(this.x) + ',' + py.repr(this.y[2]) + ')'; }
  }

  // homr: model.py:274
  class Staff extends DebugDrawable {
    constructor(grid) {
      super();
      // grid[0] of an empty list: Python's IndexError (Staff.merge of two staffs without a
      // common x position ends here)
      if (!grid.length) throw py.error('IndexError', 'list index out of range');
      this.grid = grid;
      this.minX = grid[0].x;
      this.maxX = grid[grid.length - 1].x;
      this.minY = py.min(grid.map(function (p) { return py.min(p.y); }));
      this.maxY = py.max(grid.map(function (p) { return py.max(p.y); }));
      this.averageUnitSize = np.median(grid.map(function (p) { return p.averageUnitSize; }));
      this.symbols = [];
      this.isGrandstaff = false;
      this._yTolerance = constants.maxNumberOfLedgerLines * this.averageUnitSize;
    }
    // homr: model.py:286
    isOnStaffZone(item) {
      var point = this.getAt(item.center[0]);
      if (point === null) return false;
      if (item.center[1] > point.y[point.y.length - 1] + this._yTolerance || item.center[1] < point.y[0] - this._yTolerance) return false;
      return true;
    }
    // homr: model.py:297
    merge(other) {
      var gridA = new Map(), gridB = new Map();
      this.grid.forEach(function (p) { gridA.set(py.int(py.round(p.x)), p); });
      other.grid.forEach(function (p) { gridB.set(py.int(py.round(p.x)), p); });
      var xPositions = Array.from(gridA.keys()).filter(function (x) { return gridB.has(x); }).sort(function (a, b) { return a - b; });
      var grid = xPositions.map(function (x) { return gridA.get(x).merge(gridB.get(x)); });
      var result = new Staff(grid);
      Array.prototype.push.apply(result.symbols, this.symbols);
      Array.prototype.push.apply(result.symbols, other.symbols);
      result.isGrandstaff = true;
      return result;
    }
    // homr: model.py:313
    // Inverse of merge: splits a grand staff into its upper and lower staff (or null).
    split() {
      var lines = constants.numberOfLinesOnAStaff;
      var grid = this.grid.filter(function (p) { return p.y.length === 2 * lines; });
      if (!grid.length) return null;
      var upper = new Staff(grid.map(function (p) { return new StaffPoint(p.x, p.y.slice(0, lines), p.angle); }));
      var lower = new Staff(grid.map(function (p) { return new StaffPoint(p.x, p.y.slice(lines), p.angle); }));
      var boundary = np.median(grid.map(function (p) { return (p.y[lines - 1] + p.y[lines]) / 2; }));
      this.symbols.forEach(function (symbol) { (symbol.center[1] < boundary ? upper : lower).addSymbol(symbol); });
      return [upper, lower];
    }
    // homr: model.py:328
    addSymbol(symbol) { this.symbols.push(symbol); }
    // homr: model.py:331
    getAt(x) {
      var closestPoint = py.min(this.grid, function (p) { return Math.abs(p.x - x); });
      if (Math.abs(closestPoint.x - x) > constants.staffPositionTolerance) return null;
      return closestPoint;
    }
    // homr: model.py:337
    yDistanceTo(point) {
      var staffPoint = this.getAt(point[0]);
      if (staffPoint === null) return 1e10; // something large to mimic infinity
      return py.min(staffPoint.y.map(function (y) { return Math.abs(y - point[1]); }));
    }
    // homr: model.py:343
    drawOntoImage(img, color) {
      color = color || [255, 0, 0];
      if (!this.grid.length) return;
      for (var i = 0; i < this.grid[0].y.length; i++) {
        for (var j = 0; j < this.grid.length - 1; j++) {
          var p1 = this.grid[j], p2 = this.grid[j + 1];
          cv2().line(img, [py.int(p1.x), py.int(p1.y[i])], [py.int(p2.x), py.int(p2.y[i])], color, 2);
        }
      }
    }
    // one polyline per staff line, through the grid points (what drawOntoImage draws)
    toDrawable(color) {
      color = color || [255, 0, 0];
      var items = [];
      if (!this.grid.length) return items;
      for (var i = 0; i < this.grid[0].y.length; i++) {
        var pts = this.grid.map(function (p) { return [py.int(p.x), py.int(p.y[i])]; });
        items.push({ type: 'polyline', points: pts, color: color, css: bb.cssColor(color) });
      }
      return items;
    }
    // homr: model.py:354
    getBarLines() { return this.symbols.filter(function (s) { return s instanceof BarLine; }); }
    // homr: model.py:361
    getClefs() { return this.symbols.filter(function (s) { return s instanceof Clef; }); }
    // homr: model.py:368
    getNotes() { return this.symbols.filter(function (s) { return s instanceof Note; }); }
    // homr: model.py:375
    extendToXRange(minX, maxX) {
      var grid = this.grid.slice();
      if (minX >= 0 && minX < grid[0].x) grid.unshift(new StaffPoint(minX, grid[0].y, grid[0].angle));
      if (maxX >= 0 && maxX > grid[grid.length - 1].x) grid.push(new StaffPoint(maxX, grid[grid.length - 1].y, grid[grid.length - 1].angle));
      return new Staff(grid);
    }
    // homr: model.py:385
    getNumberOfNotes() { return this.getNotes().length; }
    // homr: model.py:392
    getAllExceptNotes() { return this.symbols.filter(function (s) { return !(s instanceof Note); }); }
    toString() { return 'Staff(' + this.symbols.map(String).join(', ') + ')'; }
    // homr: model.py:405
    copy() { return new Staff(this.grid); }
    // homr: model.py:408
    transformCoordinates(transformation) {
      var copy = new Staff(this.grid.map(function (p) { return p.transformCoordinates(transformation); }));
      copy.symbols = this.symbols.map(function (s) { return s.transformCoordinates(transformation); });
      copy.isGrandstaff = this.isGrandstaff;
      return copy;
    }
  }

  // homr: model.py:512
  class GrandStaffPair {
    constructor(pairIndex, score) { this.pairIndex = pairIndex; this.score = score; }
    getScore() { return this.score; }
    getIndex() { return this.pairIndex; }
    toString() { return 'staff pair: ' + py.repr(this.pairIndex) + ' with score: ' + this.score + ')'; }
  }

  // homr: model.py:417
  // A grand staff or a staff with multiple voices.
  class MultiStaff extends DebugDrawable {
    constructor(staffs, connections) {
      super();
      this.staffs = py.sorted(staffs, function (s) { return s.minY; });
      this.connections = connections;
    }
    // homr: model.py:426
    merge(other) {
      var uniqueStaffs = [], uniqueConnections = [];
      this.staffs.concat(other.staffs).forEach(function (s) { if (!py.contains(uniqueStaffs, s)) uniqueStaffs.push(s); });
      this.connections.concat(other.connections).forEach(function (c) { if (!py.contains(uniqueConnections, c)) uniqueConnections.push(c); });
      return new MultiStaff(uniqueStaffs, uniqueConnections);
    }
    // homr: model.py:445
    // Rules to determine whether two staffs should be merged into a grandstaff by this brace:
    // 1. x_distance: the left side of the staff should be close enough (within 5 * the average
    //    unit size) to the brace symbol
    // 2. y_overlap: the top and bottom of the brace symbol should overlap (at least 50% of) the
    //    staffs. Returns score = y_overlap (higher is better) - x_distance (lower is better)
    _scoreBraceWithStaffPair(symbol, upperStaff, lowerStaff, staffAbove, staffBelow) {
      var unitSize = np.median([upperStaff.averageUnitSize, lowerStaff.averageUnitSize]);
      var xDistanceThreshold = constants.grandstaffXDistanceThresholdFactor * unitSize;
      var yOverlapThreshold = constants.grandstaffYOverlapThresholdFactor * symbol.size[1];
      var symbolMinY = symbol.center[1] - symbol.size[1] / 2;
      var symbolMaxY = symbol.center[1] + symbol.size[1] / 2;
      // A real grand-staff brace hugs only the two staffs it embraces and stops short of any
      // neighboring staff. A candidate that reaches past the midpoint towards a staff outside
      // the pair is not a brace for this pair at all -- it's more likely a whole-system bracket
      // or barline that happens to touch several unrelated staffs (e.g. in an a-cappella trio
      // with no piano, where any adjacent two of the three staffs would otherwise look like a
      // plausible grand-staff pair). Overlap-ratio checks against the pair's own span can't
      // catch this, because for a bracket spanning N staffs, any 2 consecutive ones already
      // cover 2/N of it -- comfortably over 50% whenever N <= 4. Checking against the actual
      // neighboring staff's position catches it directly, regardless of N.
      if (staffAbove !== null && staffAbove !== undefined) {
        var midpointAbove = (staffAbove.maxY + upperStaff.minY) / 2;
        if (symbolMinY < midpointAbove) return 0;
      }
      if (staffBelow !== null && staffBelow !== undefined) {
        var midpointBelow = (lowerStaff.maxY + staffBelow.minY) / 2;
        if (symbolMaxY > midpointBelow) return 0;
      }
      // Distance to whichever staff's left edge is closer, not to the smaller of the two min_x
      // values. The two staffs of a system are normally aligned at their left edge, but staff
      // detection can occasionally let one staff's box bleed further left than the other (e.g.
      // picking up a stray mark near a title or instrument name). Requiring closeness to the
      // min of both mins makes the match fragile to whichever staff is noisy; requiring
      // closeness to at least one is robust to either staff being the noisy one.
      var symbolMinX = symbol.center[0];
      // Python's min / max (first argument wins over a NaN)
      var xDistance = py.min2(Math.abs(upperStaff.minX - symbolMinX), Math.abs(lowerStaff.minX - symbolMinX));
      var yOverlap = py.min2(symbolMaxY, lowerStaff.maxY) - py.max2(symbolMinY, upperStaff.minY);
      if (!(xDistance < xDistanceThreshold && yOverlap > yOverlapThreshold && yOverlap > xDistance)) return 0;
      // Score by intersection-over-union of the symbol with this staff pair's own span, rather
      // than by raw overlap in pixels. A brace_dot blob that also touches a third, unrelated
      // staff (e.g. it merged with that staff's clef ink during preprocessing) spans much more
      // than the true pair and would otherwise win purely because its absolute overlap is
      // larger, even when it fits some other pair's span far more tightly.
      var union = py.max2(symbolMaxY, lowerStaff.maxY) - py.min2(symbolMinY, upperStaff.minY);
      var iou = union > 0 ? yOverlap / union : 0.0;
      return iou - xDistance / xDistanceThreshold;
    }
    // homr: model.py:526
    _selectGrandstaffs(braceDot) {
      var self = this, pairScores = [], i;
      // step 1: try each two staffs combination, like (0,1), (1,2), (2,3), ...
      for (i = 0; i < this.staffs.length - 1; i++) {
        var staffAbove = i > 0 ? this.staffs[i - 1] : null;
        var staffBelow = i + 2 < this.staffs.length ? this.staffs[i + 2] : null;
        var bestScore = py.max(braceDot.map(function (symbol) {
          return self._scoreBraceWithStaffPair(symbol, self.staffs[i], self.staffs[i + 1], staffAbove, staffBelow);
        }));
        // step 2: all braces for the current staff pair: is there a good match
        if (bestScore > 0) pairScores.push(new GrandStaffPair([i, i + 1], bestScore));
      }
      // step 3: we can't simply return pair_scores, because some staff may be used more than
      // once, like ([0,1], score=0.5), ([1,2], score=0.8); then we only select the highest
      // score pair, which is ([1,2], score=0.8)
      var result = [], used = new Set();
      py.sorted(pairScores, function (p) { return p.getScore(); }, true).forEach(function (pair) {
        if (pair.getIndex().some(function (idx) { return used.has(idx); })) return;
        result.push(pair);
        pair.getIndex().forEach(function (idx) { used.add(idx); });
      });
      return result;
    }
    // homr: model.py:560
    _mergeSelectedPairs(pairs) {
      var result = [], i = 0;
      while (i < this.staffs.length) {
        var at = i;
        if (pairs.some(function (pair) { return pair.getIndex().indexOf(at) >= 0; })) {
          result.push(this.staffs[i].merge(this.staffs[i + 1]));
          i += 2;
          continue;
        }
        // not a grandstaff
        result.push(this.staffs[i]);
        i += 1;
      }
      return result;
    }
    // homr: model.py:573
    createGrandstaffs(braceDot) {
      if (this.staffs.length < 2) return this;
      var pairs = this._selectGrandstaffs(braceDot);
      if (!pairs.length) return this;
      return new MultiStaff(this._mergeSelectedPairs(pairs), this.connections);
    }
    // homr: model.py:582
    breakApart() { return this.staffs.map(function (s) { return new MultiStaff([s], []); }); }
    // homr: model.py:585
    drawOntoImage(img, color) {
      color = color || [255, 0, 0];
      this.staffs.forEach(function (s) { s.drawOntoImage(img, color); });
      this.connections.forEach(function (c) { c.drawOntoImage(img, color); });
    }
    toDrawable(color) {
      color = color || [255, 0, 0];
      var items = [];
      this.staffs.forEach(function (s) { Array.prototype.push.apply(items, s.toDrawable(color)); });
      this.connections.forEach(function (c) { Array.prototype.push.apply(items, c.toDrawable(color)); });
      return items;
    }
  }
  MultiStaff.GrandStaffPair = GrandStaffPair;

  OMR.model = {
    InputPredictions: InputPredictions, SymbolOnStaff: SymbolOnStaff, Accidental: Accidental, Rest: Rest,
    StemDirection: StemDirection, NoteHeadType: NoteHeadType, noteNames: noteNames, Note: Note, BarLine: BarLine,
    Clef: Clef, StaffPoint: StaffPoint, Staff: Staff, MultiStaff: MultiStaff, GrandStaffPair: GrandStaffPair,
    makeEnum: makeEnum
  };
})(typeof self !== 'undefined' ? self : globalThis);
