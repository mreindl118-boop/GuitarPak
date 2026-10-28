/* soundLAB OMR: port of homr/brace_dot_detection.py (AGPL-3.0, github.com/liebharc/homr).
   Braces, brackets and bar lines that connect neighbouring staffs: staffs of one system
   become a MultiStaff, two staffs joined by a brace a grand staff. */
(function (G) {
  'use strict';
  var OMR = G.OMR = G.OMR || {};
  var np = OMR.np, py = OMR.py, constants = OMR.constants, bb = OMR.bounding_boxes, model = OMR.model;
  var RotatedBoundingBox = bb.RotatedBoundingBox, MultiStaff = model.MultiStaff;
  var cv2 = function () { return OMR.cv2; };

  // homr: brace_dot_detection.py:11
  function prepareBraceDotImage(symbols, staff) {
    var braceDot = cv2().subtract(symbols, staff);
    // Remove horizontal lines and Make elements larger.
    var kernel = cv2().getStructuringElement(cv2().MORPH_ELLIPSE, [1, 5]);
    var out = cv2().erode(np.astype(braceDot, 'uint8'), kernel);
    kernel = cv2().getStructuringElement(cv2().MORPH_ELLIPSE, [5, 35]);
    return cv2().dilate(out, kernel);
  }

  // homr: brace_dot_detection.py:22
  // Recover a brace/bracket candidate's true vertical span even if it merged
  // with unrelated ink during preprocessing. A real brace is wide (it
  // bulges), while ink it can accidentally fuse with, such as a neighboring
  // staff's clef or a chain of note stems, is comparatively thin. We keep
  // only the rows that are close to the blob's own widest row, using a
  // threshold relative to that blob (not an absolute pixel count), so this
  // works regardless of scan resolution or how much extra ink got attached.
  function trimSymbolToCoreSpan(symbol) {
    var r = cv2().boundingRect(symbol.contours), x = r[0], y = r[1], w = r[2], h = r[3];
    if (h <= 0 || w <= 0) return symbol;
    var mask = np.zeros([h, w], 'uint8');
    var c = symbol.contours, shifted = new Int32Array(c.length);
    for (var i = 0; i < c.length; i += 2) { shifted[i] = c[i] - x; shifted[i + 1] = c[i + 1] - y; }
    cv2().drawContours(mask, [shifted], -1, 255, cv2().FILLED);
    var rowWidths = new Array(h).fill(0), maxWidth = 0, row, col;
    for (row = 0; row < h; row++) {
      for (col = 0; col < w; col++) if (mask.data[row * w + col] > 0) rowWidths[row]++;
      if (rowWidths[row] > maxWidth) maxWidth = rowWidths[row];
    }
    if (maxWidth === 0) return symbol;
    var coreRows = [];
    for (row = 0; row < h; row++) if (rowWidths[row] >= maxWidth * constants.braceCoreWidthRatio) coreRows.push(row);
    if (coreRows.length === 0) return symbol;
    var coreMinY = y + py.int(py.min(coreRows));
    var coreMaxY = y + py.int(py.max(coreRows)) + 1;
    var coreHeight = coreMaxY - coreMinY;
    if (coreHeight <= 0) return symbol;
    var newBox = [[symbol.center[0], (coreMinY + coreMaxY) / 2], [symbol.size[0], coreHeight], symbol.angle];
    return new RotatedBoundingBox(newBox, symbol.contours, symbol.debugId);
  }

  // homr: brace_dot_detection.py:57
  // We filter elements in two steps:
  // 1. Use a rough unit size estimate to reduce the data size
  // 2. Find the closest staff and take its unit size to take warping into account
  //
  // Also drops candidates narrower than min_width_for_brace_dot_candidate here (see its
  // definition in homr/constants.py) - a fixed pixel width tied to the dilation kernel that
  // built these candidates, not to unit size, so it belongs in this rough/absolute pass
  // rather than the per-staff unit-size-relative pass below.
  function filterForTallElements(braceDot, staffs) {
    // staffs[0]: Python raises IndexError without staffs (main.py raises "No staffs found" first)
    if (!staffs.length) throw py.error('IndexError', 'list index out of range');
    var roughUnitSize = staffs[0].averageUnitSize;
    var symbolsLargerThanRoughEstimate = braceDot.filter(function (symbol) {
      return symbol.size[1] > constants.minHeightForBraceRough(roughUnitSize) &&
        symbol.size[0] < constants.maxWidthForBraceRough(roughUnitSize) &&
        symbol.size[0] >= constants.minWidthForBraceDotCandidate;
    });
    var result = [];
    symbolsLargerThanRoughEstimate.forEach(function (symbol) {
      var closestStaff = py.min(staffs, function (staff) { return staff.yDistanceTo(symbol.center); });
      var unitSize = closestStaff.averageUnitSize;
      if (symbol.size[1] > constants.minHeightForBrace(unitSize)) result.push(symbol);
    });
    return result;
  }

  // homr: brace_dot_detection.py:87
  function getConnectionsBetweenStaffsAtBarLines(staff1, staff2, braceDot) {
    var barLines1 = staff1.getBarLines();
    var barLines2 = staff2.getBarLines();
    var result = [];
    braceDot.forEach(function (symbol) {
      var symbolThicker = symbol.makeBoxThicker(30);
      var firstOverlappingStaff1 = barLines1.filter(function (line) { return symbolThicker.isOverlapping(line.box); });
      var firstOverlappingStaff2 = barLines2.filter(function (line) { return symbolThicker.isOverlapping(line.box); });
      if (firstOverlappingStaff1.length >= 1 && firstOverlappingStaff2.length >= 1) result.push(symbol);
    });
    return result;
  }

  // homr: brace_dot_detection.py:106
  function getConnectionsBetweenStaffsAtClefs(staff1, staff2, braceDot) {
    var clefs1 = staff1.getClefs();
    var clefs2 = staff2.getClefs();
    var result = [];
    braceDot.forEach(function (symbol) {
      var symbolThicker = symbol.makeBoxThicker(constants.toleranceForStaffAtAnyPoint(staff1.averageUnitSize));
      var firstOverlappingStaff1 = clefs1.filter(function (clef) { return symbolThicker.isOverlapping(clef.box); });
      var firstOverlappingStaff2 = clefs2.filter(function (clef) { return symbolThicker.isOverlapping(clef.box); });
      if (firstOverlappingStaff1.length >= 1 && firstOverlappingStaff2.length >= 1) result.push(symbol);
    });
    return result;
  }

  // homr: brace_dot_detection.py:127
  function getConnectionsBetweenStaffsAtLines(staff1, staff2, braceDot) {
    var result = [];
    braceDot.forEach(function (symbol) {
      var symbolThicker = symbol.makeBoxThicker(constants.toleranceForTouchingClefs(staff1.averageUnitSize));
      var point1 = staff1.getAt(symbol.center[0]);
      var point2 = staff2.getAt(symbol.center[0]);
      if (point1 === null || point2 === null) return;
      if (symbolThicker.isOverlapping(point1.toBoundingBox()) && symbolThicker.isOverlapping(point2.toBoundingBox())) {
        result.push(symbol);
      }
    });
    return result;
  }

  // homr: brace_dot_detection.py:147
  function getConnectionsBetweenStaffs(staff1, staff2, braceDot) {
    var result = [];
    Array.prototype.push.apply(result, getConnectionsBetweenStaffsAtBarLines(staff1, staff2, braceDot));
    Array.prototype.push.apply(result, getConnectionsBetweenStaffsAtClefs(staff1, staff2, braceDot));
    Array.prototype.push.apply(result, getConnectionsBetweenStaffsAtLines(staff1, staff2, braceDot));
    return result;
  }

  // homr: brace_dot_detection.py:157
  // If two MultiStaff objects share a staff, merge them into one MultiStaff object.
  // (Staff and MultiStaff compare by identity in Python: no __eq__)
  function mergeMultiStaffIfTheyShareAStaff(staffs) {
    var result = [];
    staffs.forEach(function (staff) {
      var anyMerged = false;
      for (var i = 0; i < result.length; i++) {
        var existing = result[i];
        if (staff.staffs.some(function (s) { return existing.staffs.indexOf(s) >= 0; })) {
          result.splice(i, 1);
          result.push(existing.merge(staff));
          anyMerged = true;
          break;
        }
      }
      if (!anyMerged) result.push(staff);
    });
    return result;
  }

  // homr: brace_dot_detection.py:175
  function createGrandstaffs(staffs, braceDot) {
    if (staffs.length === 0) return staffs;
    return staffs.map(function (s) { return s.createGrandstaffs(braceDot); });
  }

  // homr: brace_dot_detection.py:183
  // Connect staffs from multiple voices or grand staffs by searching for brackets and grand staffs.
  function findBracesBracketsAndGrandStaffLines(debug, staffs, braceDot) {
    braceDot = braceDot.map(trimSymbolToCoreSpan);
    braceDot = filterForTallElements(braceDot, staffs);
    var result = [];
    staffs.forEach(function (staff, i) {
      var neighbors = [];
      if (i > 0) neighbors.push(staffs[i - 1]);
      if (i < staffs.length - 1) neighbors.push(staffs[i + 1]);
      var anyConnectedNeighbor = false;
      neighbors.forEach(function (neighbor) {
        var connections = getConnectionsBetweenStaffs(staff, neighbor, braceDot);
        if (connections.length >= constants.minimumConnectionsToFormCombinedStaff) {
          result.push(new MultiStaff([staff, neighbor], connections));
          anyConnectedNeighbor = true;
        }
      });
      if (!anyConnectedNeighbor) result.push(new MultiStaff([staff], []));
    });
    return createGrandstaffs(mergeMultiStaffIfTheyShareAStaff(result), braceDot);
  }

  OMR.brace_dot_detection = {
    prepareBraceDotImage: prepareBraceDotImage,
    findBracesBracketsAndGrandStaffLines: findBracesBracketsAndGrandStaffLines,
    // private helpers (Python's _name)
    _trimSymbolToCoreSpan: trimSymbolToCoreSpan, _filterForTallElements: filterForTallElements,
    _getConnectionsBetweenStaffsAtBarLines: getConnectionsBetweenStaffsAtBarLines,
    _getConnectionsBetweenStaffsAtClefs: getConnectionsBetweenStaffsAtClefs,
    _getConnectionsBetweenStaffsAtLines: getConnectionsBetweenStaffsAtLines,
    _getConnectionsBetweenStaffs: getConnectionsBetweenStaffs,
    _mergeMultiStaffIfTheyShareAStaff: mergeMultiStaffIfTheyShareAStaff,
    _createGrandstaffs: createGrandstaffs
  };
})(typeof self !== 'undefined' ? self : globalThis);
