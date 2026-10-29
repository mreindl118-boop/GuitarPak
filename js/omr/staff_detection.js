/* soundLAB OMR: port of homr/staff_detection.py (AGPL-3.0, github.com/liebharc/homr).
   Staffs from the staff-line mask: line fragments are connected into lines, five parallel
   lines through a clef or bar line make an anchor, anchors grow into raw staffs, and the raw
   staffs are resampled into a grid of StaffPoints (one every 10 px).

   Python ranges are {start, stop} (step 1) here; boxes compare like Python's __eq__ / hash
   (equals() / key() from bounding_boxes.js), so sets of fragments are Sets of keys. */
(function (G) {
  'use strict';
  var OMR = G.OMR = G.OMR || {};
  var np = OMR.np, py = OMR.py, constants = OMR.constants, bb = OMR.bounding_boxes;
  var model = OMR.model;
  var DebugDrawable = bb.DebugDrawable, RotatedBoundingBox = bb.RotatedBoundingBox;
  var Staff = model.Staff, StaffPoint = model.StaffPoint;
  var cv2 = function () { return OMR.cv2; };
  var eprint = function () { OMR.simple_logging.eprint.apply(null, arguments); };

  // Python's exceptions (OMR.py.error: e.name / e.pyType = the Python type)
  function pyError(type, msg) { return py.error ? py.error(type, msg) : Object.assign(new Error(msg), { name: type, pyType: type }); }
  // a Python range(start, stop) (step 1): .start / .stop as Python keeps them
  function pyRange(start, stop) { return { start: start, stop: stop }; }
  // range(start, stop, step) as a list
  function rangeList(start, stop, step) { return py.range(start, stop, step); }
  // list.remove(x): the first item that IS x or == x (Python checks identity, then __eq__)
  function removeFirst(list, x) {
    for (var i = 0; i < list.length; i++) {
      var e = list[i];
      if (e === x || (e && typeof e.equals === 'function' && e.equals(x))) { list.splice(i, 1); return; }
    }
    throw pyError('ValueError', 'list.remove(x): x not in list');
  }
  // set(boxes) as a Set of their hash keys (boxes hash and compare by their box tuple)
  function keySet(boxes) {
    var s = new Set();
    for (var i = 0; i < boxes.length; i++) s.add(boxes[i].key());
    return s;
  }
  function isSubset(a, b) {
    var ok = true;
    a.forEach(function (k) { if (!b.has(k)) ok = false; });
    return ok;
  }
  function textItem(text, at, color) {
    return { type: 'text', text: text, x: at[0], y: at[1], color: color, css: bb.cssColor(color) };
  }
  function lineItem(p1, p2, color) {
    return { type: 'polyline', points: [p1, p2], color: color, css: bb.cssColor(color) };
  }

  // homr: staff_detection.py:19
  // Remove small details.
  function prepareStaffImage(img) {
    var kernel = cv2().getStructuringElement(cv2().MORPH_ELLIPSE, [5, 3]);
    var out = cv2().erode(np.astype(img, 'uint8'), kernel);
    kernel = cv2().getStructuringElement(cv2().MORPH_ELLIPSE, [9, 3]);
    return cv2().dilate(out, kernel);
  }

  // homr: staff_detection.py:29
  function makeLinesStronger(img, kernelSize) {
    var kernel = cv2().getStructuringElement(cv2().MORPH_ELLIPSE, kernelSize);
    img = cv2().dilate(np.astype(img, 'uint8'), kernel);
    img = np.astype(cv2().threshold(img, 0.1, 1, cv2().THRESH_BINARY)[1], 'uint8');
    return img;
  }

  // homr: staff_detection.py:36
  class StaffLineSegment extends DebugDrawable {
    constructor(debugId, staffFragments) {
      super();
      this.debugId = debugId;
      this.staffFragments = py.sorted(staffFragments, function (box) { return box.box[0][0]; });
      this.minX = py.min(staffFragments.map(function (line) { return line.center[0] - line.size[0] / 2; }));
      this.maxX = py.max(staffFragments.map(function (line) { return line.center[0] + line.size[0] / 2; }));
      this.minY = py.min(staffFragments.map(function (line) { return line.center[1] - line.size[1] / 2; }));
      this.maxY = py.max(staffFragments.map(function (line) { return line.center[1] + line.size[1] / 2; }));
    }
    // homr: staff_detection.py:45
    merge(other) {
      var staffLines = this.staffFragments.slice();
      other.staffFragments.forEach(function (fragment) {
        if (!py.contains(staffLines, fragment)) staffLines.push(fragment);
      });
      return new StaffLineSegment(this.debugId, staffLines);
    }
    // homr: staff_detection.py:52
    getAt(x) {
      var tolerance = constants.staffLineSegmentXTolerance;
      for (var i = 0; i < this.staffFragments.length; i++) {
        var fragment = this.staffFragments[i];
        if (x >= fragment.center[0] - fragment.size[0] / 2 - tolerance &&
            x <= fragment.center[0] + fragment.size[0] / 2 + tolerance) return fragment;
      }
      return null;
    }
    // homr: staff_detection.py:62
    isOverlapping(other) {
      for (var i = 0; i < this.staffFragments.length; i++) {
        for (var j = 0; j < other.staffFragments.length; j++) {
          if (this.staffFragments[i].isOverlapping(other.staffFragments[j])) return true;
        }
      }
      return false;
    }
    // homr: staff_detection.py:69
    drawOntoImage(img, color) {
      color = color || [255, 0, 0];
      this.staffFragments.forEach(function (line) { line.drawOntoImage(img, color); });
      var first = this.staffFragments[0];
      cv2().putText(img, String(this.debugId), [py.int(first.box[0][0]), py.int(first.box[0][1])],
        cv2().FONT_HERSHEY_SIMPLEX, 1, color, 2, cv2().LINE_AA);
    }
    toDrawable(color) {
      color = color || [255, 0, 0];
      var items = [];
      this.staffFragments.forEach(function (line) { Array.prototype.push.apply(items, line.toDrawable(color)); });
      var first = this.staffFragments[0];
      items.push(textItem(String(this.debugId), [py.int(first.box[0][0]), py.int(first.box[0][1])], color));
      return items;
    }
    // homr: staff_detection.py:83 (__eq__: the same set of fragments)
    equals(other) {
      if (!(other instanceof StaffLineSegment)) return false;
      var a = keySet(this.staffFragments), b = keySet(other.staffFragments);
      return a.size === b.size && isSubset(a, b);
    }
    // homr: staff_detection.py:89 (__hash__ stand-in)
    key() { return Array.from(keySet(this.staffFragments)).sort().join('|'); }
  }

  // homr: staff_detection.py:93
  // An anchor is what we call a reliable staff line. That is five parlallel bar lines
  // which by their relation to other symbols make it likely that they belong to a staff.
  // This is a crucial step as it allows us to then build the complete staff.
  class StaffAnchor extends DebugDrawable {
    constructor(staffLines, symbol) {
      super();
      this.staffLines = staffLines;
      var yPositions = staffLines.map(function (line) {
        return line.staffFragments[0].getCenterExtrapolated(symbol.center[0]);
      }).sort(function (a, b) { return a - b; });
      var yDeltas = [];
      for (var i = 1; i < yPositions.length; i++) yDeltas.push(Math.abs(yPositions[i] - yPositions[i - 1]));
      this.unitSizes = yDeltas;
      if (yDeltas.length === 0) this.averageUnitSize = 0.0;
      else this.averageUnitSize = np.mean(yDeltas);
      this.symbol = symbol;
      this.maxY = py.max(staffLines.map(function (line) { return line.maxY; }));
      this.minY = py.min(staffLines.map(function (line) { return line.minY; }));
      var maxNumberOfLedgerLines = 5;
      this.yRange = pyRange(py.int(py.min(yPositions)), py.int(py.max(yPositions)));
      this.zone = pyRange(
        py.int(this.minY - maxNumberOfLedgerLines * this.averageUnitSize),
        py.int(this.maxY + maxNumberOfLedgerLines * this.averageUnitSize));
    }
    // homr: staff_detection.py:124
    drawOntoImage(img, color) {
      color = color || [0, 255, 0];
      this.staffLines.forEach(function (staff) { staff.drawOntoImage(img, color); });
      this.symbol.drawOntoImage(img, color);
      var x = py.int(this.symbol.center[0]);
      cv2().line(img, [x - 50, this.zone.start], [x + 50, this.zone.start], color, 2);
      cv2().line(img, [x - 50, this.zone.stop], [x + 50, this.zone.stop], color, 2);
    }
    toDrawable(color) {
      color = color || [0, 255, 0];
      var items = [];
      this.staffLines.forEach(function (staff) { Array.prototype.push.apply(items, staff.toDrawable(color)); });
      Array.prototype.push.apply(items, this.symbol.toDrawable(color));
      var x = py.int(this.symbol.center[0]);
      items.push(lineItem([x - 50, this.zone.start], [x + 50, this.zone.start], color));
      items.push(lineItem([x - 50, this.zone.stop], [x + 50, this.zone.stop], color));
      return items;
    }
  }

  // homr: staff_detection.py:133
  // every fragment's contour points, concatenated (Python: a list of (1, 2) points)
  function getAllContours(lines) {
    var allFragments = [];
    lines.forEach(function (line) { Array.prototype.push.apply(allFragments, line.staffFragments); });
    return np.concat(allFragments.map(function (fragment) { return fragment.contours; }));
  }

  // homr: staff_detection.py:143
  // A raw staff is made of parts which we found on the image. It has gaps and segments start and
  // end differently on every staff line.
  class RawStaff extends RotatedBoundingBox {
    constructor(staffId, lines, anchors) {
      var contours = getAllContours(lines);
      var box = cv2().minAreaRect(contours);
      super(box, contours, staffId);
      this.staffId = staffId;
      this.lines = lines;
      this.anchors = anchors;
      this.minX = this.center[0] - this.size[0] / 2;
      this.maxX = this.center[0] + this.size[0] / 2;
      this.minY = this.center[1] - this.size[1] / 2;
      this.maxY = this.center[1] + this.size[1] / 2;
    }
    // homr: staff_detection.py:161
    merge(other) {
      var lines = [];
      for (var i = 0; i < this.lines.length; i++) lines.push(other.lines[i].merge(this.lines[i]));
      return new RawStaff(this.staffId, lines, this.anchors.concat(other.anchors));
    }
    // homr: staff_detection.py:167
    drawOntoImage(img, color) {
      color = color || [255, 0, 0];
      this.lines.forEach(function (line) { line.drawOntoImage(img, color); });
    }
    toDrawable(color) {
      color = color || [255, 0, 0];
      var items = [];
      this.lines.forEach(function (line) { Array.prototype.push.apply(items, line.toDrawable(color)); });
      return items;
    }
  }

  // homr: staff_detection.py:172
  function getStaffForAnchor(anchor, staffs) {
    for (var s = 0; s < staffs.length; s++) {
      var staff = staffs[s];
      for (var i = 0; i < anchor.staffLines.length; i++) {
        var lineRequirement = keySet(anchor.staffLines[i].staffFragments);
        if (isSubset(lineRequirement, keySet(staff.lines[i].staffFragments))) return staff;
      }
    }
    return null;
  }

  // homr: staff_detection.py:181
  // First we build a list of all lines by combining fragments. Then we identify the lines
  // which go through the anchors and build a staff from them.
  function findRawStaffsByConnectingLineFragments(anchors, staffFragments) {
    var staffs = [], staffId = 0;
    anchors.forEach(function (anchor) {
      var existingStaff = getStaffForAnchor(anchor, staffs);
      var fragments = staffFragments.filter(function (fragment) {
        return fragment.center[1] >= anchor.zone.start && fragment.center[1] <= anchor.zone.stop;
      });
      var connected = connectStaffLines(fragments, anchor.averageUnitSize);
      var staffLines = [];
      anchor.staffLines.forEach(function (anchorLine) {
        var lineRequirement = keySet(anchorLine.staffFragments);
        var matchingAnchor = connected.filter(function (line) { return isSubset(lineRequirement, keySet(line.staffFragments)); });
        if (matchingAnchor.length === 1) Array.prototype.push.apply(staffLines, matchingAnchor);
        else staffLines.push(anchorLine);
      });
      if (existingStaff) {
        removeFirst(staffs, existingStaff);
        staffs.push(existingStaff.merge(new RawStaff(staffId, staffLines, [anchor])));
      } else {
        staffs.push(new RawStaff(staffId, staffLines, [anchor]));
      }
      staffId += 1;
    });
    return staffs;
  }

  // homr: staff_detection.py:217
  // Sometimes we find the same staff twice, but fail to connect them.
  // This function removes the duplicates.
  function removeDuplicateStaffs(staffs) {
    var result = [];
    staffs.forEach(function (staff) {
      var overlapping = result.filter(function (other) { return staff.isOverlapping(other); });
      if (overlapping.length === 0) { result.push(staff); return; }
      var staffDuplicates = 2;
      if (overlapping.length >= staffDuplicates) {
        // Think this through again, for the moment we just take the existing ones
        return;
      }
      if (overlapping[0].anchors.length < staff.anchors.length) {
        // The staff with the most anchors is the most reliable one
        result = result.filter(function (s) { return !s.equals(overlapping[0]); });
        result.push(staff);
      }
    });
    return result;
  }

  // homr: staff_detection.py:239
  // True if right continues left in the same row: a short gap and the lines line up.
  // One line may be off, the line tracking sometimes jumps to a neighboring line.
  function continues(left, right) {
    var anchors = left.anchors.concat(right.anchors);
    var unitSize = np.mean(anchors.map(function (anchor) { return anchor.averageUnitSize; }));
    var gap = right.minX - left.maxX;
    var maxGapInUnitSizes = 15;
    if (unitSize <= 0 || gap < 0 || gap > maxGapInUnitSizes * unitSize) return false;
    if (left.lines.length !== right.lines.length) { // zip(..., strict=True)
      throw pyError('ValueError', 'zip() argument 2 is ' + (right.lines.length < left.lines.length ? 'shorter' : 'longer') + ' than argument 1');
    }
    var linesWhichLineUp = 0;
    for (var i = 0; i < left.lines.length; i++) {
      var leftLine = left.lines[i], rightLine = right.lines[i];
      var leftEnd = leftLine.staffFragments[leftLine.staffFragments.length - 1];
      var rightStart = rightLine.staffFragments[0];
      var leftY = leftEnd.getCenterExtrapolated(leftLine.maxX);
      var rightY = rightStart.getCenterExtrapolated(rightLine.minX);
      if (Math.abs(leftY - rightY) <= unitSize / 2) linesWhichLineUp += 1;
    }
    return linesWhichLineUp >= constants.numberOfLinesOnAStaff - 1;
  }

  // homr: staff_detection.py:261
  // The line tracking breaks a staff in two if symbols cover its lines over a long
  // distance, e.g. at a clef change. This merges the two parts again.
  function mergeStaffsInSameRow(staffs) {
    var result = py.sorted(staffs, function (staff) { return staff.minX; });
    var i = 0;
    while (i < result.length) {
      var right = null;
      for (var j = i + 1; j < result.length; j++) {
        if (continues(result[i], result[j])) { right = result[j]; break; }
      }
      if (right === null) { i += 1; continue; }
      var merged = result[i].merge(right);
      removeFirst(result, right);
      result[i] = merged;
    }
    return result;
  }

  // homr: staff_detection.py:279
  // Checks which fragments connect to each other (extrapolation is used to fill gaps)
  // and builds a list of StaffLineSegments
  // where segments have an increased likelyhood to belong to a staff.
  function connectStaffLines(staffLines, unitSize) {
    // With the pop below we are going through the elements from left to right
    var sortedByRightToLeft = py.sorted(staffLines, function (box) { return box.bottomLeft[0]; }, true);
    var result = [], activeLinesToCheck = [], lastCleanupAtX = 0;
    while (sortedByRightToLeft.length > 0) {
      var currentStaffLine = sortedByRightToLeft.pop();
      var x = currentStaffLine.bottomLeft[0];

      if (x - lastCleanupAtX > constants.maxLineGapSize(unitSize)) {
        // Remove line ends which are most unlikely to be relevant anymore
        // If their right edge is too far away from the current left edge
        // then it will never be a valid connection anymore
        activeLinesToCheck = activeLinesToCheck.filter(function (item) {
          return x - item[item.length - 1].bottomRight[0] < constants.maxLineGapSize(unitSize);
        });
        lastCleanupAtX = x;
      }

      var isShortLine = currentStaffLine.box[1][0] < constants.isShortLine(unitSize);
      if (isShortLine) continue;
      var connected = false;
      for (var i = 0; i < activeLinesToCheck.length; i++) {
        var activeLine = activeLinesToCheck[i];
        if (activeLine[activeLine.length - 1].isOverlappingExtrapolated(currentStaffLine, unitSize)) {
          activeLine.push(currentStaffLine);
          connected = true;
        }
      }
      if (!connected) {
        var newList = [currentStaffLine];
        result.push(newList);
        activeLinesToCheck.push(newList);
      }
    }
    var resultTopToBottom = py.sorted(result, function (lines) { return lines[0].box[0][1]; });
    return resultTopToBottom.map(function (lines, i) { return new StaffLineSegment(i, lines); });
  }

  // homr: staff_detection.py:327
  function extrapolatedLineY(line, x) {
    var fragment = line.getAt(x) || line.staffFragments[0];
    return fragment.getCenterExtrapolated(x);
  }

  // homr: staff_detection.py:332
  // Two staff lines cross if their relative vertical order flips somewhere across their
  // shared x-range - checked via each line's own extrapolated y-position (the same
  // extrapolation StaffAnchor and resample_staff_segment already use to place a line at a
  // given x), rather than a literal polygon-overlap test on the underlying fragments.
  //
  // A raw polygon test is too sensitive to a single wide fragment with a few degrees of
  // rotation: its far corners can swing several pixels beyond its own center and
  // geometrically touch an adjacent, unrelated staff line's box even though the two lines
  // never actually cross in y (seen on smb/123.png's system 4 bass staff, where this false
  // positive silently discarded an otherwise-valid 5-line anchor).
  function areLinesCrossing(lines) {
    for (var i = 0; i < lines.length; i++) {
      for (var j = i + 1; j < lines.length; j++) {
        var overlapStart = py.max2(lines[i].minX, lines[j].minX);
        var overlapStop = py.min2(lines[i].maxX, lines[j].maxX);
        if (overlapStart >= overlapStop) continue;
        var deltaStart = extrapolatedLineY(lines[i], overlapStart) - extrapolatedLineY(lines[j], overlapStart);
        var deltaStop = extrapolatedLineY(lines[i], overlapStop) - extrapolatedLineY(lines[j], overlapStop);
        if (deltaStart === 0 || deltaStop === 0 || (deltaStart > 0) !== (deltaStop > 0)) return true;
      }
    }
    return false;
  }

  // homr: staff_detection.py:362
  function areLinesParallel(lines, unitSize) {
    var allAngles = [], allFragments = [];
    lines.forEach(function (line) {
      line.staffFragments.forEach(function (fragment) {
        allAngles.push(fragment.angle);
        allFragments.push(fragment);
      });
    });
    if (allAngles.length === 0) return false;
    var averageAngle = np.mean(allAngles);
    for (var i = 0; i < allFragments.length; i++) {
      var fragment = allFragments[i];
      if (Math.abs(fragment.angle - averageAngle) > constants.maxAngleForLinesToBeParallel &&
          fragment.size[0] > constants.isShortConnectedLine(unitSize)) return false;
    }
    return true;
  }

  // homr: staff_detection.py:384
  function beginsOrEndsOnOneStaffLine(line, staffLines, unitSize) {
    for (var i = 0; i < staffLines.length; i++) {
      var fragment = staffLines[i].getAt(line.center[0]);
      if (fragment === null) continue;
      var staffY = fragment.getCenterExtrapolated(line.center[0]);
      if (Math.abs(staffY - line.center[1]) < unitSize) return true;
    }
    return false;
  }

  // homr: staff_detection.py:397
  // Segnet's line prediction can miss one of a staff's five lines outright, especially in
  // densely packed multi-staff systems - a real gap in the underlying detection, not a
  // logic bug. If that happens but the other four lines are still evenly spaced at the
  // estimated unit size, synthesize the missing line by extrapolation instead of discarding
  // the whole anchor attempt.
  //
  // The anchor symbol (a bar line or clef stem) spans close to the full staff height by
  // construction, so comparing the found lines' own extent against the symbol's own
  // top/bottom tells us which end is short a line, rather than guessing. Returns None
  // (leaving the anchor attempt to fail as before) unless exactly one end shows a
  // unit-size-sized gap and the other end doesn't - anything less clear-cut (e.g. a real
  // 3-line pattern, or noise) is left alone rather than guessed at.
  // (Not called by homr's pipeline at the pinned version; ported for completeness.)
  function extrapolateMissingStaffLine(connectedLines, symbol, estimatedUnitSize) {
    if (connectedLines.length !== constants.numberOfLinesOnAStaff - 1) return null;
    var ordered = py.sorted(connectedLines, function (line) { return line.staffFragments[0].center[1]; });
    var positions = ordered.map(function (line) { return line.staffFragments[0].center[1]; });
    var gaps = [];
    for (var i = 0; i < positions.length - 1; i++) gaps.push(positions[i + 1] - positions[i]);
    var tolerance = 0.3 * estimatedUnitSize;
    if (gaps.some(function (gap) { return Math.abs(gap - estimatedUnitSize) > tolerance; })) return null;

    var symbolTop = symbol.center[1] - symbol.size[1] / 2;
    var symbolBottom = symbol.center[1] + symbol.size[1] / 2;
    var gapAbove = positions[0] - symbolTop;
    var gapBelow = symbolBottom - positions[positions.length - 1];
    var isMissingAbove = Math.abs(gapAbove - estimatedUnitSize) <= tolerance && gapBelow <= tolerance;
    var isMissingBelow = Math.abs(gapBelow - estimatedUnitSize) <= tolerance && gapAbove <= tolerance;
    if (isMissingAbove === isMissingBelow) return null;

    var reference = isMissingAbove ? ordered[0] : ordered[ordered.length - 1];
    var offset = isMissingAbove ? -estimatedUnitSize : estimatedUnitSize;
    var synthesizedFragments = reference.staffFragments.map(function (fragment) {
      return new RotatedBoundingBox([[fragment.center[0], fragment.center[1] + offset], fragment.box[1], fragment.box[2]],
        fragment.contours, fragment.debugId);
    });
    var synthesizedLine = new StaffLineSegment(reference.debugId, synthesizedFragments);
    if (isMissingAbove) return [synthesizedLine].concat(ordered);
    return ordered.concat([synthesizedLine]);
  }

  // homr: staff_detection.py:450
  // Finds staff anchors by looking for five parallel bar lines which go
  // over or interrupt symbols which are always on staffs
  // (and never above or beyond them like notes can be).
  function findStaffAnchors(staffLines, anchorSymbols, areClefs) {
    var result = [];
    anchorSymbols.forEach(function (centerSymbol) {
      // As the symbol disconnects the staff lines it's the hardest to detect them at the center.
      // Therefore we try to detect them at the left and right side of the symbol as well.
      var adjacent;
      if (areClefs) {
        adjacent = [
          centerSymbol.moveToXHorizontalBy(-10),
          centerSymbol,
          centerSymbol.moveToXHorizontalBy(10),
          centerSymbol.moveToXHorizontalBy(30),
          centerSymbol.moveToXHorizontalBy(60),
          centerSymbol.moveToXHorizontalBy(80)
        ];
      } else {
        adjacent = [
          centerSymbol.moveToXHorizontalBy(-10),
          centerSymbol.moveToXHorizontalBy(-5),
          centerSymbol,
          centerSymbol.moveToXHorizontalBy(5),
          centerSymbol.moveToXHorizontalBy(10)
        ];
      }
      adjacent.forEach(function (symbol) {
        var estimatedUnitSize = py.round(symbol.size[1] / (constants.numberOfLinesOnAStaff - 1));
        var thickenedBarLine = symbol.makeBoxTaller(estimatedUnitSize);
        var overlappingStaffLines = staffLines.filter(function (line) { return line.isIntersecting(thickenedBarLine); });
        var connectedLines = connectStaffLines(overlappingStaffLines, estimatedUnitSize);
        if (connectedLines.length > constants.numberOfLinesOnAStaff) {
          connectedLines = connectedLines.filter(function (line) {
            return (line.maxX - line.minX) > constants.isShortConnectedLine(estimatedUnitSize);
          });
        }
        if (connectedLines.length !== constants.numberOfLinesOnAStaff) return;
        if (!areLinesParallel(connectedLines, estimatedUnitSize)) return;
        if (areLinesCrossing(connectedLines)) return;
        if (!areClefs && !beginsOrEndsOnOneStaffLine(symbol, connectedLines, estimatedUnitSize)) return;
        result.push(new StaffAnchor(connectedLines, symbol));
      });
    });
    return result;
  }

  // homr: staff_detection.py:511
  // (a generator in Python; its consumers take every point, so a list is the same)
  function resampleStaffSegment(anchor, staff, axisRange) {
    var out = [];
    var x0 = anchor.symbol.center[0];
    var lineFragments = anchor.staffLines.map(function (line) { return line.staffFragments[0]; });
    var centers = lineFragments.map(function (line) { return line.getCenterExtrapolated(x0); });
    var previousPoint = new StaffPoint(x0, centers, np.mean(lineFragments.map(function (line) { return line.angle; }))); // Dummy point at the anchor points
    var unit = anchor.averageUnitSize;
    for (var r = 0; r < axisRange.length; r++) {
      var x = axisRange[r];
      var lines = staff.lines.map(function (line) { return line.getAt(x); });
      var axisCenter = lines.map(function (line) { return line !== null ? line.getCenterExtrapolated(x) : null; });
      var centerValues = axisCenter.filter(function (center) { return center !== null; });
      var incomplete = axisCenter.every(function (center) { return center === null; });
      if (incomplete) continue;
      var deltas = np.diff(centerValues);
      // (indices of center_values used on axis_center, as homr does)
      var nonParallel = deltas.map(function (delta) { return delta < 0.5 * unit; });
      var i;
      for (i = 0; i < nonParallel.length; i++) {
        if (nonParallel[i]) { axisCenter[i] = null; axisCenter[i + 1] = null; }
      }

      for (i = 0; i < previousPoint.y.length; i++) {
        var centerValue = axisCenter[i];
        if (centerValue === undefined) throw pyError('IndexError', 'list index out of range');
        if (centerValue !== null && Math.abs(centerValue - previousPoint.y[i]) > 0.5 * unit) axisCenter[i] = null;
      }

      var prevCenter = -1, n = axisCenter.length;
      var order = py.range(n).concat(py.range(n).reverse());
      for (var k = 0; k < order.length; k++) {
        i = order[k];
        if (axisCenter[i] !== null) prevCenter = i;
        else if (prevCenter >= 0) {
          var value = axisCenter[prevCenter];
          if (value !== null) axisCenter[i] = value + unit * (i - prevCenter);
        }
      }
      incomplete = axisCenter.some(function (center) { return center === null; });
      if (incomplete) continue;
      var angle = np.mean(lines.filter(function (line) { return line !== null; }).map(function (line) { return line.angle; }));
      previousPoint = new StaffPoint(x, axisCenter.filter(function (c) { return c !== null; }), angle);
      out.push(previousPoint);
    }
    return out;
  }

  // homr: staff_detection.py:560
  function resampleStaff(staff) {
    var anchorsLeftToRight = py.sorted(staff.anchors, function (a) { return a.symbol.center[0]; });
    var staffDensity = 10;

    function roundToDensity(x) { return py.int(py.round(x / staffDensity)) * staffDensity; }

    var start = py.floorDiv(staff.minX, staffDensity) * staffDensity;
    var stop = (py.floorDiv(staff.maxX, staffDensity) + 1) * staffDensity;

    var grid = [];
    var x = start;
    anchorsLeftToRight.forEach(function (anchor, i) {
      var toLeft = rangeList(roundToDensity(x), roundToDensity(anchor.symbol.center[0]), staffDensity);
      var toRightStop, toRight;
      if (i < anchorsLeftToRight.length - 1) {
        toRightStop = py.int((anchor.symbol.center[0] + anchorsLeftToRight[i + 1].symbol.center[0]) / 2);
        toRight = rangeList(py.int(anchor.symbol.center[0]), toRightStop, staffDensity);
      } else {
        toRightStop = roundToDensity(stop);
        toRight = rangeList(roundToDensity(anchor.symbol.center[0]), toRightStop, staffDensity);
      }
      x = toRightStop;
      Array.prototype.push.apply(grid, resampleStaffSegment(anchor, staff, toLeft.slice().reverse()).reverse());
      Array.prototype.push.apply(grid, resampleStaffSegment(anchor, staff, toRight));
    });

    // Staff(grid) reads grid[0]: Python raises IndexError on an empty grid
    if (!grid.length) throw pyError('IndexError', 'list index out of range');
    return new Staff(grid);
  }

  // homr: staff_detection.py:593
  // The RawStaffs might have gaps and segments start and end differently on every staff line.
  // This function resamples the staffs so for every point of the staff we know the y positions
  // of all staff lines. In the end this makes the staffs easier to use in the rest of
  // the analysis.
  function resampleStaffs(staffs) {
    return staffs.map(resampleStaff);
  }

  // homr: staff_detection.py:606
  // Removes staffs which are outside the page dimensions.
  // imageShape = [h, w] like numpy's shape
  function filterEdgeOfVision(staffs, imageShape) {
    var staffWidths = Float64Array.from(staffs.map(function (s) { return s.maxX - s.minX; }));
    var usualWidth = np.mean(staffWidths); // np.average

    var result = [];
    staffs.forEach(function (staff) {
      var beyondBottom = staff.maxY >= imageShape[0];
      var beyondTop = staff.minY < 0;
      if (beyondBottom || beyondTop) return;

      var staffWidth = staff.maxX - staff.minX;
      var shorterThanUsual = staffWidth < usualWidth / 2;
      var beyondLeft = staff.minX < 0.01 * imageShape[1];
      var beyondRight = staff.maxX > 0.99 * imageShape[1];

      if ((beyondLeft || beyondRight) && shorterThanUsual) return;

      result.push(staff);
    });
    return result;
  }

  // homr: staff_detection.py:632
  // The horizontal range (left, right) of the long staffs on the page. The median, as
  // single staffs can be connected to staffs of a neighbor page.
  function mainColumn(extents) {
    var longest = py.max(extents.map(function (e) { return e[1] - e[0]; }));
    var longStaffs = extents.filter(function (e) { return e[1] - e[0] >= 0.75 * longest; });
    return [
      np.median(longStaffs.map(function (e) { return e[0]; })),
      np.median(longStaffs.map(function (e) { return e[1]; }))
    ];
  }

  // homr: staff_detection.py:645
  function shareInColumn(left, right, column) {
    var inside = py.min2(right, column[1]) - py.max2(left, column[0]);
    return right > left ? inside / (right - left) : 0.0;
  }

  // homr: staff_detection.py:650
  // Removes staffs of a partly visible neighbor page, e.g. in a photo of a book:
  // much shorter than the staffs of the page and mostly beside them.
  function filterNeighborPage(staffs) {
    if (staffs.length === 0) return staffs;
    var column = mainColumn(staffs.map(function (s) { return [s.minX, s.maxX]; }));
    var minWidth = (column[1] - column[0]) / 2;
    return staffs.filter(function (s) {
      return s.maxX - s.minX >= minWidth || shareInColumn(s.minX, s.maxX, column) >= 0.5;
    });
  }

  // homr: staff_detection.py:666
  function sortStaffsTopToBottom(staffs) {
    return py.sorted(staffs, function (staff) { return staff.minY; });
  }

  // homr: staff_detection.py:670
  function filterUnusualAnchors(anchors) {
    if (anchors.length === 0) return anchors;
    var unitSizes = anchors.map(function (anchor) { return anchor.averageUnitSize; });
    var averageUnitSize = np.mean(unitSizes);
    var unitSizeDeviation = np.std(unitSizes);
    var result = [];
    anchors.forEach(function (anchor) {
      if (Math.abs(anchor.averageUnitSize - averageUnitSize) > 3 * unitSizeDeviation) return;
      result.push(anchor);
    });
    return result;
  }

  // homr: staff_detection.py:684
  function initZone(clefAnchors, imageShape) {
    function makeRange(start, stop) {
      return pyRange(py.max2(py.int(start), 0), py.min2(py.int(stop), imageShape[1]));
    }

    // We increase the range only right of the clef as it's the only place
    // where we expect to find staff lines
    var marginRight = 10;
    var ranges = clefAnchors.map(function (c) {
      return makeRange(c.symbol.bottomLeft[0], c.symbol.topRight[0] + marginRight);
    });
    ranges = py.sorted(ranges, function (r) { return r.start; });
    var result = [];
    ranges.forEach(function (r, i) {
      if (i === 0) result.push(r);
      else {
        var overlapsWithTheLast = r.start < result[result.length - 1].stop;
        if (overlapsWithTheLast) result[result.length - 1] = pyRange(result[result.length - 1].start, r.stop);
        else result.push(r);
      }
    });
    return result;
  }

  // homr: staff_detection.py:709
  // peaks: the peak indices, norm: the normalised row counts -> [validPeaks (booleans), groups]
  function filterLinePeaks(peaks, norm, maxGapRatio) {
    if (maxGapRatio === undefined) maxGapRatio = 1.5;
    var lines = constants.numberOfLinesOnAStaff;
    var validPeaks = peaks.map(function () { return true; });
    var idx, i;

    // Filter by height
    for (idx = 0; idx < peaks.length; idx++) {
      var maxPeakHeight = 15;
      if (norm[peaks[idx]] > maxPeakHeight) validPeaks[idx] = false;
    }

    // Filter by x-axis
    var gaps = [];
    for (i = 1; i < peaks.length; i++) gaps.push(peaks[i] - peaks[i - 1]);
    var count = py.max2(5, py.round(peaks.length * 0.2));
    var approxUnit = np.mean(gaps.slice().sort(function (a, b) { return a - b; }).slice(0, count));
    var maxGap = approxUnit * maxGapRatio;

    var extPeaks = [peaks[0] - maxGap - 1].concat(Array.from(peaks)); // Prepend an invalid peak for better handling edge case
    var groups = [], group = -1;
    for (i = 1; i < extPeaks.length; i++) {
      if (extPeaks[i] - extPeaks[i - 1] > maxGap) group += 1;
      groups.push(group);
    }

    groups.push(groups[groups.length - 1] + 1); // Append an invalid group for better handling edge case
    var curG = groups[0];
    count = 1;
    function fill(a, b) { for (var k = a; k < b; k++) validPeaks[k] = false; }
    function sumAt(list) { var s = 0; list.forEach(function (p) { s += norm[p]; }); return s; } // builtin sum()
    for (idx = 1; idx < groups.length; idx++) {
      group = groups[idx];
      if (group === curG) { count += 1; continue; }

      if (count < lines) {
        // Incomplete peaks. Also eliminates the top and bottom incomplete staff lines.
        fill(idx - count, idx);
      } else if (count > lines) {
        var candPeaks = peaks.slice(idx - count, idx);
        var headPart = candPeaks.slice(0, lines);
        var tailPart = candPeaks.slice(-lines);
        if (sumAt(headPart) > sumAt(tailPart)) fill(idx - count + lines, idx);
        else fill(idx - count, idx - lines);
      }

      curG = group;
      count = 1;
    }
    return [validPeaks, groups.slice(0, -1)];
  }

  // homr: staff_detection.py:762
  // image: a 2-D 0/1 mask (a vertical slice of the staff mask) -> groups of five row indices
  function findHorizontalLines(image, unitSize, lineThreshold) {
    if (lineThreshold === undefined) lineThreshold = 0.0;
    // Split into zones horizontally and detects staff lines separately.
    var h = image.h, w = image.w, d = image.data;
    var count = new Uint16Array(h + 2); // np.insert(count, [0, len(count)], [0, 0]): zeros around
    for (var y = 0; y < h; y++) {
      var n = 0;
      for (var x = 0; x < w; x++) if (d[y * w + x] > 0) n++;
      count[y + 1] = n; // uint16 like homr's np.zeros(..., dtype=np.uint16)
    }
    if (np.std(count) === 0) return [];
    var mean = np.mean(count), std = np.std(count);
    var norm = new Float64Array(count.length);
    for (var i = 0; i < count.length; i++) norm[i] = (count[i] - mean) / std;
    // distance is meant to merge anti-aliasing sub-peaks within one line's own thickness into
    // a single center, not to suppress a neighboring, genuinely distinct staff line - but two
    // real adjacent staff lines are themselves spaced ~unit_size apart, so passing unit_size
    // unmodified leaves no margin for the normal +/-1-2px jitter in real scans: a line-to-line
    // gap that measures a pixel under unit_size gets one of its two real peaks suppressed,
    // fragmenting a clean 5-line group into incomplete ones. Match the 0.3 * unit_size
    // tolerance already used for gap validation elsewhere in this file (see
    // _extrapolate_missing_staff_line) rather than a hard, jitter-intolerant cutoff.
    var centers = OMR.find_peaks.findPeaks(norm, { height: lineThreshold, distance: 0.7 * unitSize, prominence: 1 })[0]
      .map(function (c) { return c - 1; });
    if (centers.length < constants.numberOfLinesOnAStaff) return [];
    norm = norm.subarray(1, norm.length - 1); // Remove prepend / append
    var groups = filterLinePeaks(centers, norm)[1];
    var groupedCenters = new Map();
    centers.forEach(function (center, k) {
      var groupNumber = groups[k];
      if (!groupedCenters.has(groupNumber)) groupedCenters.set(groupNumber, []);
      groupedCenters.get(groupNumber).push(center);
    });
    var completeGroups = [];
    groupedCenters.forEach(function (groupedCenter) {
      if (groupedCenter.length === constants.numberOfLinesOnAStaff) {
        completeGroups.push(groupedCenter.slice().sort(function (a, b) { return a - b; }));
      }
    });
    return completeGroups;
  }

  // homr: staff_detection.py:804
  // zones: Python ranges {start, stop} of columns
  function findFiveLineGroups(image, zones, unitSize) {
    var result = [];
    zones.forEach(function (zone) {
      var verticalSlice = np.crop(image, null, null, zone.start, zone.stop);
      var linesGroups = findHorizontalLines(verticalSlice, unitSize);
      linesGroups.forEach(function (group) {
        var minY = py.min(group), maxY = py.max(group);
        var centerY = (minY + maxY) / 2;
        var centerX = zone.start + (zone.stop - zone.start) / 2;
        var box = [[py.int(centerX), py.int(centerY)], [zone.stop - zone.start, py.int(maxY - minY)], 0];
        result.push(new RotatedBoundingBox(box, new Float64Array(0), 0)); // np.array([])
      });
    });
    return result;
  }

  // homr: staff_detection.py:821
  function predictOtherAnchorsFromClefs(clefAnchors, image) {
    if (clefAnchors.length === 0) return [];
    var averageUnitSize = np.mean(clefAnchors.map(function (anchor) { return anchor.averageUnitSize; }));
    var anchorSymbols = clefAnchors.map(function (anchor) { return anchor.symbol; });
    var clefZones = initZone(clefAnchors, [image.h, image.w]);
    var result = findFiveLineGroups(image, clefZones, averageUnitSize);
    return result.filter(function (r) { return !r.isOverlappingWithAny(anchorSymbols); });
  }

  // homr: staff_detection.py:833
  // Positions across the page, as fraction of its width, to search for staffs without clef
  var slicesAcrossPage = [0.2, 0.35, 0.5, 0.65, 0.8];

  // homr: staff_detection.py:837
  // Finds staffs whose clef and bar lines were missed, e.g. in a blurry photo, by their
  // staff lines alone. Only keeps staffs in the column of the other staffs and where no
  // staff is yet, as lines shining through the paper can create shifted duplicates.
  function findStaffsWithoutClef(rawStaffs, clefAnchors, staffFragments, image) {
    if (rawStaffs.length === 0 || clefAnchors.length === 0) return [];
    var unitSize = np.mean(clefAnchors.map(function (anchor) { return anchor.averageUnitSize; }));
    var width = image.w;
    var sliceWidth = py.max2(10, py.int(2 * unitSize));
    var zones = slicesAcrossPage.map(function (f) {
      return pyRange(py.int(f * width), py.min2(width, py.int(f * width) + sliceWidth));
    });
    var boxes = findFiveLineGroups(image, zones, unitSize);
    var anchors = filterUnusualAnchors(findStaffAnchors(staffFragments, boxes, true));
    var candidates = removeDuplicateStaffs(findRawStaffsByConnectingLineFragments(anchors, staffFragments));
    var column = mainColumn(rawStaffs.map(function (s) { return [s.minX, s.maxX]; }));
    var minWidth = (column[1] - column[0]) / 2;
    return candidates.filter(function (c) {
      return c.maxX - c.minX >= minWidth &&
        shareInColumn(c.minX, c.maxX, column) >= 0.9 &&
        !rawStaffs.some(function (s) { return c.isOverlapping(s); });
    });
  }

  // homr: staff_detection.py:872
  // Wide fragments (large x dimension) which are curved tend to be filtered by later steps.
  // We instead split them into smaller parts, so that the parts better approximate the different
  // angles of the curve.
  function breakWideFragments(fragments, limit) {
    if (limit === undefined) limit = 100;
    function flat(points) {
      var out = new Int32Array(points.length * 2);
      for (var i = 0; i < points.length; i++) { out[2 * i] = points[i][0]; out[2 * i + 1] = points[i][1]; }
      return out;
    }
    var result = [];
    fragments.forEach(function (fragment) {
      var remainingFragment = fragment;
      while (remainingFragment.size[0] > limit) {
        var c = remainingFragment.contours, n = c.length / 2, i;
        var minX = Infinity;
        for (i = 0; i < n; i++) if (c[2 * i] < minX) minX = c[2 * i];
        var contoursLeft = [], contoursRight = [];
        for (i = 0; i < n; i++) (c[2 * i] < minX + limit ? contoursLeft : contoursRight).push([c[2 * i], c[2 * i + 1]]);
        // sort by x
        contoursLeft = py.sorted(contoursLeft, function (p) { return p[0]; });
        contoursRight = py.sorted(contoursRight, function (p) { return p[0]; });
        if (contoursLeft.length === 0 || contoursRight.length === 0) break;
        // Make sure that the contours remain connected by adding
        // the first point of the right side to the left side and vice versa
        contoursLeft.push(contoursRight[0]);
        contoursRight.push(contoursLeft[contoursLeft.length - 1]);
        result.push(bb.createRotatedBoundingBox(flat(contoursLeft), remainingFragment.debugId));
        remainingFragment = bb.createRotatedBoundingBox(flat(contoursRight), remainingFragment.debugId);
      }
      result.push(remainingFragment);
    });
    return result;
  }

  // homr: staff_detection.py:906
  // Estimates the unit size from the staff lines around clefs.
  // Fallback for images without noteheads, e.g. a staff with only rests.
  function estimateUnitSizeFromClefs(staffFragments, clefsKeys) {
    var anchors = findStaffAnchors(staffFragments, clefsKeys, true);
    if (anchors.length === 0) return null;
    return np.median(anchors.map(function (anchor) { return anchor.averageUnitSize; }));
  }

  // homr: staff_detection.py:919
  // Detect staffs on the image. Staffs can be warped, have gaps and can be interrupted by symbols.
  function detectStaff(debug, image, staffFragments, clefsKeys, likelyBarOrRestsLines) {
    var clefAnchors = findStaffAnchors(staffFragments, clefsKeys, true);
    eprint('Found ' + clefAnchors.length + ' clefs');
    var staffAnchors = clefAnchors.slice();

    var possibleOtherClefs = predictOtherAnchorsFromClefs(clefAnchors, image);
    eprint('Found ' + possibleOtherClefs.length + ' possible other clefs');
    Array.prototype.push.apply(staffAnchors, findStaffAnchors(staffFragments, possibleOtherClefs, true));

    Array.prototype.push.apply(staffAnchors, findStaffAnchors(staffFragments, likelyBarOrRestsLines, false));

    staffAnchors = filterUnusualAnchors(staffAnchors);
    eprint('Found ' + staffAnchors.length + ' staff anchors');
    debug.writeBoundingBoxesAlternatingColors('staff_anchors', staffAnchors);

    var rawStaffsWithPossibleDuplicates = findRawStaffsByConnectingLineFragments(staffAnchors, staffFragments);
    eprint('Found ' + rawStaffsWithPossibleDuplicates.length + ' staffs');
    var rawStaffs = removeDuplicateStaffs(rawStaffsWithPossibleDuplicates);
    if (rawStaffsWithPossibleDuplicates.length !== rawStaffs.length) {
      eprint('Removed ' + (rawStaffsWithPossibleDuplicates.length - rawStaffs.length) + ' duplicate staffs');
    }
    var numberOfStaffs = rawStaffs.length;
    rawStaffs = mergeStaffsInSameRow(rawStaffs);
    if (rawStaffs.length !== numberOfStaffs) eprint('Merged ' + (numberOfStaffs - rawStaffs.length) + ' staffs split in a row');
    var staffsWithoutClef = findStaffsWithoutClef(rawStaffs, clefAnchors, staffFragments, image);
    if (staffsWithoutClef.length > 0) eprint('Found ' + staffsWithoutClef.length + ' staffs without clef');
    Array.prototype.push.apply(rawStaffs, staffsWithoutClef);
    debug.writeBoundingBoxesAlternatingColors('raw_staffs', rawStaffs.concat(likelyBarOrRestsLines, clefsKeys));

    var staffs = resampleStaffs(rawStaffs);

    staffs = filterEdgeOfVision(staffs, [image.h, image.w]);
    staffs = filterNeighborPage(staffs);

    staffs = sortStaffsTopToBottom(staffs);

    return staffs;
  }

  OMR.staff_detection = {
    prepareStaffImage: prepareStaffImage, makeLinesStronger: makeLinesStronger,
    StaffLineSegment: StaffLineSegment, StaffAnchor: StaffAnchor, RawStaff: RawStaff,
    getStaffForAnchor: getStaffForAnchor, findRawStaffsByConnectingLineFragments: findRawStaffsByConnectingLineFragments,
    removeDuplicateStaffs: removeDuplicateStaffs, mergeStaffsInSameRow: mergeStaffsInSameRow,
    connectStaffLines: connectStaffLines, areLinesCrossing: areLinesCrossing, areLinesParallel: areLinesParallel,
    beginsOrEndsOnOneStaffLine: beginsOrEndsOnOneStaffLine, findStaffAnchors: findStaffAnchors,
    resampleStaffSegment: resampleStaffSegment, resampleStaff: resampleStaff, resampleStaffs: resampleStaffs,
    filterEdgeOfVision: filterEdgeOfVision, filterNeighborPage: filterNeighborPage,
    sortStaffsTopToBottom: sortStaffsTopToBottom, filterUnusualAnchors: filterUnusualAnchors, initZone: initZone,
    filterLinePeaks: filterLinePeaks, findHorizontalLines: findHorizontalLines,
    predictOtherAnchorsFromClefs: predictOtherAnchorsFromClefs, slicesAcrossPage: slicesAcrossPage,
    findStaffsWithoutClef: findStaffsWithoutClef, breakWideFragments: breakWideFragments,
    estimateUnitSizeFromClefs: estimateUnitSizeFromClefs, detectStaff: detectStaff,
    // private helpers (Python's _name)
    _getAllContours: getAllContours, _continues: continues, _extrapolatedLineY: extrapolatedLineY,
    _extrapolateMissingStaffLine: extrapolateMissingStaffLine, _mainColumn: mainColumn,
    _shareInColumn: shareInColumn, _findFiveLineGroups: findFiveLineGroups,
    // Python semantics helpers used here
    _pyRange: pyRange, _removeFirst: removeFirst
  };
})(typeof self !== 'undefined' ? self : globalThis);
