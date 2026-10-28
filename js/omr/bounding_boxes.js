/* soundLAB OMR: port of homr/bounding_boxes.py (AGPL-3.0, github.com/liebharc/homr).

   Representations (see notes/foundation.md):
   - a rotated rect / "box" is [[cx, cy], [w, h], angle] like cv2's RotatedRect tuples
   - contours are flat Int32Array x,y pairs (cv2 contour (N,1,2) flattened); a merged group's
     contour is their concatenation
   - polygon: flat Int32Array of x,y pairs (boxPoints(...).astype(int64) / ellipse2Poly)
   Python's ==, hash() and `in` on boxes: equals(other), key(), OMR.py.contains(list, box). */
(function (G) {
  'use strict';
  var OMR = G.OMR = G.OMR || {};
  var np = OMR.np, py = OMR.py, constants = OMR.constants;
  var cv2 = function () { return OMR.cv2; };
  var eprint = function () { OMR.simple_logging.eprint.apply(null, arguments); };

  // homr: bounding_boxes.py:16
  function calculateEdgesOfRotatedRectangle(box) {
    var hw = box[1][0] / 2, hh = box[1][1] / 2, cx = box[0][0], cy = box[0][1];
    var topLeft = [cx - hw, cy - hh];
    var bottomLeft = [cx + -hw, cy + hh];
    var topRight = [cx + hw, cy + -hh];
    var bottomRight = [cx + hw, cy + hh];
    return [topLeft, bottomLeft, topRight, bottomRight];
  }

  // cv2.boxPoints(box).astype(np.int64) as flat Int32Array (truncation toward zero)
  function boxPolygon(box) {
    var p = cv2().boxPoints(box), out = new Int32Array(8);
    for (var i = 0; i < 4; i++) { out[2 * i] = Math.trunc(p[i][0]); out[2 * i + 1] = Math.trunc(p[i][1]); }
    return out;
  }

  // homr: bounding_boxes.py:33
  function doPolygonsOverlap(poly1, poly2) {
    // A vertex-containment check ("is a corner of one polygon inside the other") is not
    // sufficient: two long, thin, near-parallel rectangles (e.g. two staffs' bounding boxes
    // with slightly opposite rotation) can overlap heavily along their shared middle while
    // every corner of each stays outside the other - the overlap region is bounded by edge
    // crossings, not by either polygon containing the other's vertices. Use a proper convex
    // polygon intersection (both boxPoints-derived polygons here are convex) as the primary
    // check instead of reimplementing edge-intersection tests by hand.
    var area = cv2().intersectConvexConvex(Float32Array.from(poly1), Float32Array.from(poly2))[0];
    if (area > 0) return true;
    // Two polygons that merely touch (share an edge or corner, zero-width contact) are
    // still considered "overlapping" by callers - intersectConvexConvex reports zero area
    // for that degenerate case, so fall back to the boundary-inclusive vertex check for it.
    var i;
    for (i = 0; i + 1 < poly1.length; i += 2) if (cv2().pointPolygonTest(poly2, [poly1[i], poly1[i + 1]], false) >= 0) return true;
    for (i = 0; i + 1 < poly2.length; i += 2) if (cv2().pointPolygonTest(poly1, [poly2[i], poly2[i + 1]], false) >= 0) return true;
    return false;
  }

  // the colour tuples homr draws with are BGR (cv2); the preview wants CSS
  function cssColor(bgr) { return 'rgb(' + bgr[2] + ',' + bgr[1] + ',' + bgr[0] + ')'; }
  function pairsOf(flat) { return np.pairs(flat); }

  // homr: bounding_boxes.py:58
  class DebugDrawable {
    // homr: bounding_boxes.py:60 (abstract)
    drawOntoImage(img, color) { throw new Error('drawOntoImage is abstract'); }
    // the browser's stand-in for drawing: plain shapes the UI paints over the page preview,
    // [{type: 'polygon' | 'polyline' | 'ellipse' | 'rect', ..., color: [b, g, r], css}]
    toDrawable(color) { return []; }
  }

  // homr: bounding_boxes.py:64
  class AnyPolygon extends DebugDrawable {
    constructor(polygon) { super(); this.polygon = polygon; }
  }

  // homr: bounding_boxes.py:69
  // A bounding box in the format of (x1, y1, x2, y2)
  class BoundingBox extends AnyPolygon {
    constructor(box, contours, debugId) {
      var center = [(box[0] + box[2]) / 2, (box[1] + box[3]) / 2];
      var size = [box[2] - box[0], box[3] - box[1]];
      var rotatedBox = [center, size, 0];
      super(boxPolygon(rotatedBox));
      this.debugId = debugId === undefined ? 0 : debugId;
      this.contours = contours;
      this.box = box;
      this.center = center;
      this.size = size;
      this.rotatedBox = rotatedBox;
    }
    // homr: bounding_boxes.py:84
    drawOntoImage(img, color) {
      cv2().rectangle(img, [py.int(this.box[0]), py.int(this.box[1])], [py.int(this.box[2]), py.int(this.box[3])], color || [0, 0, 255], 2);
    }
    toDrawable(color) {
      color = color || [0, 0, 255];
      return [{ type: 'rect', x1: py.int(this.box[0]), y1: py.int(this.box[1]), x2: py.int(this.box[2]), y2: py.int(this.box[3]), color: color, css: cssColor(color) }];
    }
    // homr: bounding_boxes.py:93
    extract(img) {
      return OMR.image_utils.cropImage(img, this.box[0], this.box[1], this.box[2] + 1, this.box[3] + 1);
    }
    // homr: bounding_boxes.py:96
    blankEverythingOutsideOfBox(img) {
      var x1 = this.box[0], y1 = this.box[1], x2 = this.box[2], y2 = this.box[3];
      var white = np.fullLike(img, 255, 'uint8');
      return np.assign(white, y1, y2, x1, x2, np.crop(img, y1, y2, x1, x2));
    }
    // homr: bounding_boxes.py:103
    increaseSizeInEachDimension(increase, imageSize) {
      return new BoundingBox([
        py.max2(this.box[0] - increase, 0),
        py.max2(this.box[1] - increase, 0),
        py.min2(this.box[2] + increase, imageSize[1]),
        py.min2(this.box[3] + increase, imageSize[0])
      ], this.contours, this.debugId);
    }
  }

  // homr: bounding_boxes.py:118
  class AngledBoundingBox extends AnyPolygon {
    constructor(box, contours, polygon, debugId) {
      super(polygon);
      this.debugId = debugId === undefined ? 0 : debugId;
      this.contours = contours;
      var angle = box[2];
      if (angle > 135) {
        angle = angle - 180;
        this.box = [[box[0][0], box[0][1]], [box[1][0], box[1][1]], angle];
      } else if (angle < -135) {
        angle = angle + 180;
        this.box = [[box[0][0], box[0][1]], [box[1][0], box[1][1]], angle];
      } else if (angle > 45) {
        angle = angle - 90;
        this.box = [[box[0][0], box[0][1]], [box[1][1], box[1][0]], angle];
      } else if (angle < -45) {
        angle = angle + 90;
        this.box = [[box[0][0], box[0][1]], [box[1][1], box[1][0]], angle];
      } else {
        this.box = [[box[0][0], box[0][1]], [box[1][0], box[1][1]], angle];
      }
      this.center = this.box[0];
      this.size = this.box[1];
      this.angle = this.box[2];
      var e = calculateEdgesOfRotatedRectangle(this.box);
      this.topLeft = e[0]; this.bottomLeft = e[1]; this.topRight = e[2]; this.bottomRight = e[3];
      this.polygon = polygon;
    }
    // homr: bounding_boxes.py:149
    isOverlapping(other) {
      if (!this._canShapesPossiblyTouch(other)) return false;
      return doPolygonsOverlap(this.polygon, other.polygon);
    }
    // homr: bounding_boxes.py:154
    isOverlappingWithAny(others) {
      for (var i = 0; i < others.length; i++) if (this.isOverlapping(others[i])) return true;
      return false;
    }
    // homr: bounding_boxes.py:160
    // A fast check if the two shapes can possibly touch. If this returns false, the two
    // shapes do not touch. If this returns true, the two shapes might touch and further
    // checks are necessary.
    _canShapesPossiblyTouch(other) {
      // get the centers and major axes of the rectangles
      var center1 = this.box[0], axes1 = this.box[1], center2, axes2;
      if (other instanceof BoundingBox) { center2 = other.rotatedBox[0]; axes2 = other.rotatedBox[1]; }
      else if (other instanceof AngledBoundingBox) { center2 = other.box[0]; axes2 = other.box[1]; }
      else throw new Error('Unknown type ' + (other && other.constructor && other.constructor.name));
      // max(axes): Python's max keeps the first of (w, nan)
      var majorAxis1 = py.max2(axes1[0], axes1[1]), majorAxis2 = py.max2(axes2[0], axes2[1]);
      // the distance between the centers
      var dx = center1[0] - center2[0], dy = center1[1] - center2[1];
      var distance = Math.sqrt(dx * dx + dy * dy);
      // if the distance is greater than the sum of the major axes, the rectangles do not overlap
      if (distance > majorAxis1 + majorAxis2) return false;
      return true;
    }
    // Python __eq__: same box tuple (exact floats); other types are never equal
    equals(other) {
      if (!(other instanceof AngledBoundingBox)) return false;
      var a = this.box, b = other.box;
      return a[0][0] === b[0][0] && a[0][1] === b[0][1] && a[1][0] === b[1][0] && a[1][1] === b[1][1] && a[2] === b[2];
    }
    // Python __hash__ stand-in: a Map / Set key with the same equality as equals()
    key() { var b = this.box; return b[0][0] + ',' + b[0][1] + ',' + b[1][0] + ',' + b[1][1] + ',' + b[2]; }
    toString() { return py.repr(this.box); }
  }

  // homr: bounding_boxes.py:212
  class RotatedBoundingBox extends AngledBoundingBox {
    constructor(box, contours, debugId) {
      super(box, contours, boxPolygon(box), debugId);
    }
    // homr: bounding_boxes.py:216
    drawOntoImage(img, color) {
      cv2().drawContours(img, [boxPolygon(this.box)], 0, color || [0, 0, 255], 2);
    }
    toDrawable(color) {
      color = color || [0, 0, 255];
      return [{ type: 'polygon', points: pairsOf(boxPolygon(this.box)), color: color, css: cssColor(color) }];
    }
    // homr: bounding_boxes.py:220
    isIntersecting(other) {
      if (!this._canShapesPossiblyTouch(other)) return false;
      // TODO (homr): How is this different from is_overlapping?
      return cv2().rotatedRectangleIntersection(this.box, other.box)[0] !== cv2().INTERSECT_NONE;
    }
    // homr: bounding_boxes.py:226
    ensureMinDimension(minWidth, minHeight) {
      return new RotatedBoundingBox([[this.box[0][0], this.box[0][1]], [py.max2(this.box[1][0], minWidth), py.max2(this.box[1][1], minHeight)], this.box[2]], this.contours, this.debugId);
    }
    // homr: bounding_boxes.py:237
    makeBoxThicker(thickness) {
      if (thickness <= 0) return this;
      // We tried to move the center by int(thickness / 2), however this gave much worse results
      // for some examples. That's possibly a case of an ill defined function, but downstream
      // code depends on the behavior which we have today
      return new RotatedBoundingBox([[this.box[0][0], this.box[0][1]], [this.box[1][0] + thickness, this.box[1][1] + thickness], this.box[2]], this.contours, this.debugId);
    }
    // homr: bounding_boxes.py:254
    moveToXHorizontalBy(xDelta) {
      var newX = this.center[0] + xDelta;
      return new RotatedBoundingBox([[newX, this.center[1]], this.box[1], this.box[2]], this.contours, this.debugId);
    }
    // homr: bounding_boxes.py:260
    makeBoxTaller(thickness) {
      return new RotatedBoundingBox([[this.box[0][0], this.box[0][1]], [this.box[1][0], this.box[1][1] + thickness], this.box[2]], this.contours, this.debugId);
    }
    // homr: bounding_boxes.py:271
    makeBoxTallerKeepCenter(thickness) {
      return new RotatedBoundingBox([[this.box[0][0], this.box[0][1] - py.floorDiv(thickness, 2)], [this.box[1][0], this.box[1][1] + thickness], this.box[2]], this.contours, this.debugId);
    }
    // homr: bounding_boxes.py:282
    getCenterExtrapolated(x) {
      // np.tan: correctly rounded (OMR.np.tan), closer to numpy than Math.tan
      return (x - this.box[0][0]) * np.tan(this.box[2] / 180 * Math.PI) + this.box[0][1];
    }
    // homr: bounding_boxes.py:285
    isOverlappingExtrapolated(other, unitSize) {
      // pick left and right by the x-coordinate of the first box corner
      var left, right;
      if (this.box[0][0] > other.box[0][0]) { left = other; right = this; } else { left = this; right = other; }
      var centerX = (left.center[0] + right.center[0]) * 0.5;
      var tolerance = constants.toleranceForStaffLineDetection(unitSize);
      var maxGap = constants.maxLineGapSize(unitSize);
      if (centerX - left.center[0] - py.floorDiv(left.size[0], 2) > maxGap ||
          right.center[0] - centerX - py.floorDiv(right.size[0], 2) > maxGap) return false;
      // extrapolated y-values, same as getCenterExtrapolated but inlined
      // math.tan (glibc): correctly rounded OMR.np.tan is the closest stand-in
      var leftAngle = np.tan(left.box[2] * Math.PI / 180.0);
      var rightAngle = np.tan(right.box[2] * Math.PI / 180.0);
      var leftY = (centerX - left.box[0][0]) * leftAngle + left.box[0][1];
      var rightY = (centerX - right.box[0][0]) * rightAngle + right.box[0][1];
      return Math.abs(leftY - rightY) <= tolerance;
    }
    // homr: bounding_boxes.py:312
    toBoundingBox() {
      return new BoundingBox([py.int(this.topLeft[0]), py.int(this.topLeft[1]), py.int(this.bottomRight[0]), py.int(this.bottomRight[1])], this.contours, this.debugId);
    }
  }

  // ellipse2Poly((int(cx), int(cy)), (int(w / 2), int(h / 2)), int(angle), 0, 360, 1)
  function ellipsePolygon(box) {
    return cv2().ellipse2Poly([py.int(box[0][0]), py.int(box[0][1])], [py.int(box[1][0] / 2), py.int(box[1][1] / 2)], py.int(box[2]), 0, 360, 1);
  }

  // homr: bounding_boxes.py:325
  class BoundingEllipse extends AngledBoundingBox {
    constructor(box, contours, debugId) {
      super(box, contours, ellipsePolygon(box), debugId);
    }
    // homr: bounding_boxes.py:341
    drawOntoImage(img, color) {
      cv2().ellipse(img, this.box, color || [0, 0, 255], 2);
    }
    toDrawable(color) {
      color = color || [0, 0, 255];
      return [{ type: 'ellipse', center: [this.box[0][0], this.box[0][1]], axes: [this.box[1][0] / 2, this.box[1][1] / 2], angle: this.box[2], color: color, css: cssColor(color) }];
    }
    // homr: bounding_boxes.py:344
    makeBoxThicker(thickness) {
      return new BoundingEllipse([[this.box[0][0], this.box[0][1]], [this.box[1][0] + thickness, this.box[1][1] + thickness], this.box[2]], this.contours, this.debugId);
    }
    // homr: bounding_boxes.py:355
    makeBoxTaller(thickness) {
      return new RotatedBoundingBox([[this.box[0][0], this.box[0][1]], [this.box[1][0], this.box[1][1] + thickness], this.box[2]], this.contours, this.debugId);
    }
  }

  // homr: bounding_boxes.py:367
  function hasBoxValidSize(box) {
    return !isNaN(box[1][0]) && !isNaN(box[1][1]) && box[1][0] > 0 && box[1][1] > 0;
  }

  // homr: bounding_boxes.py:373
  // createRotatedBoundingBoxes(img, {skipMerging, minSize, maxSize, thickenBoxes})
  function createRotatedBoundingBoxes(img, opts) {
    opts = opts || {};
    var minSize = opts.minSize || null, maxSize = opts.maxSize || null;
    var contours = cv2().findContours(img, cv2().RETR_TREE, cv2().CHAIN_APPROX_SIMPLE)[0];
    var boxes = [];
    for (var i = 0; i < contours.length; i++) {
      var fitBox = cv2().minAreaRect(contours[i]);
      if (!hasBoxValidSize(fitBox)) continue;
      var box = new RotatedBoundingBox(fitBox, contours[i], i);
      if (minSize !== null && (box.size[0] < minSize[0] || box.size[1] < minSize[1])) continue;
      if (maxSize !== null) {
        if (maxSize[0] > 0 && box.size[0] > maxSize[0]) continue;
        if (maxSize[1] > 0 && box.size[1] > maxSize[1]) continue;
      }
      boxes.push(box);
    }
    if (opts.skipMerging) return boxes;
    if (opts.thickenBoxes !== undefined && opts.thickenBoxes !== null) {
      boxes = boxes.map(function (b) { return b.makeBoxThicker(opts.thickenBoxes); });
    }
    return getBoxForWholeGroup(mergeOverlayingBoundingBoxes(boxes));
  }

  // homr: bounding_boxes.py:402
  function createRotatedBoundingBox(contour, debugId) {
    return new RotatedBoundingBox(cv2().minAreaRect(contour), contour, debugId);
  }

  // homr: bounding_boxes.py:407
  // createLines(img, {threshold=100, minLineLength=100, maxLineGap=10, skipMerging})
  // OpenCV 5's HoughLinesP gives (N, 4) lines; homr's `x1, y1, x2, y2 = line[0]` was written
  // for 4.x's (N, 1, 4): this port reads each line directly (only staff_position_save_load,
  // which the app does not use, calls this).
  function createLines(img, opts) {
    opts = opts || {};
    var threshold = opts.threshold !== undefined ? opts.threshold : 100;
    var lines = cv2().HoughLinesP(img, 1, Math.PI / 180, threshold, {
      minLineLength: opts.minLineLength !== undefined ? opts.minLineLength : 100,
      maxLineGap: opts.maxLineGap !== undefined ? opts.maxLineGap : 10
    });
    if (lines === null) throw new TypeError("'NoneType' object is not iterable"); // as homr would
    var boxes = [];
    for (var i = 0; i < lines.length; i++) {
      var l = lines[i], contour = Int32Array.from([l[0], l[1], l[2], l[3]]);
      var box = cv2().minAreaRect(contour);
      if (box[1][0] > box[1][1]) boxes.push(new RotatedBoundingBox(box, contour, i));
    }
    if (opts.skipMerging) return boxes;
    return getBoxForWholeGroup(mergeOverlayingBoundingBoxes(boxes));
  }

  // homr: bounding_boxes.py:429
  // createBoundingEllipses(img, {skipMerging, minSize, maxSize})
  function createBoundingEllipses(img, opts) {
    opts = opts || {};
    var minSize = opts.minSize || null, maxSize = opts.maxSize || null;
    var contours = cv2().findContours(img, cv2().RETR_TREE, cv2().CHAIN_APPROX_SIMPLE)[0];
    var boxes = [];
    for (var i = 0; i < contours.length; i++) {
      var minLengthToFitEllipse = 5; // this is a requirement by opencv
      if (contours[i].length / 2 < minLengthToFitEllipse) continue;
      var fitBox = cv2().fitEllipse(contours[i]);
      if (!hasBoxValidSize(fitBox)) continue;
      var box = new BoundingEllipse(fitBox, contours[i], i);
      if (minSize !== null && (box.size[0] < minSize[0] || box.size[1] < minSize[1])) continue;
      if (maxSize !== null && (box.size[0] > maxSize[0] || box.size[1] > maxSize[1])) continue;
      boxes.push(box);
    }
    if (opts.skipMerging) return boxes;
    return getEllipseForWholeGroup(mergeOverlayingBoundingBoxes(boxes));
  }

  // homr: bounding_boxes.py:455
  function doGroupsOverlap(group1, group2) {
    for (var i = 0; i < group1.length; i++) for (var j = 0; j < group2.length; j++) if (group1[i].isOverlapping(group2[j])) return true;
    return false;
  }

  // homr: bounding_boxes.py:463
  function mergeGroupsRecursive(groups, step) {
    var stepLimit = 10;
    if (step > stepLimit) {
      eprint('Too many steps in _merge_groups_recursive, giving back current results');
      return groups;
    }
    var numberOfChanges = 0, merged = [], usedGroups = new Set();
    for (var i = 0; i < groups.length; i++) {
      var matchFound = false;
      if (usedGroups.has(i)) continue;
      for (var j = i + 1; j < groups.length; j++) {
        if (usedGroups.has(j)) continue;
        if (doGroupsOverlap(groups[i], groups[j])) {
          merged.push(groups[i].concat(groups[j]));
          numberOfChanges += 1;
          usedGroups.add(j);
          matchFound = true;
          break;
        }
      }
      if (!matchFound) merged.push(groups[i]);
    }
    if (numberOfChanges === 0) return merged;
    return mergeGroupsRecursive(merged, step + 1);
  }

  // homr: bounding_boxes.py:496
  function getEllipseForWholeGroup(groups) {
    return groups.map(function (group) {
      var complete = np.concat(group.map(function (b) { return b.contours; }));
      return new BoundingEllipse(cv2().minAreaRect(complete), complete);
    });
  }

  // homr: bounding_boxes.py:505
  function getBoxForWholeGroup(groups) {
    return groups.map(function (group) {
      var complete = np.concat(group.map(function (b) { return b.contours; }));
      return new RotatedBoundingBox(cv2().minAreaRect(complete), complete);
    });
  }

  // homr: bounding_boxes.py:514
  class UnionFind {
    constructor(n) {
      this.parent = py.range(n);
      this.rank = new Array(n).fill(0);
    }
    find(x) {
      if (this.parent[x] !== x) this.parent[x] = this.find(this.parent[x]);
      return this.parent[x];
    }
    union(x, y) {
      var rootX = this.find(x), rootY = this.find(y);
      if (rootX !== rootY) {
        // union by rank to keep the tree flat
        if (this.rank[rootX] > this.rank[rootY]) this.parent[rootY] = rootX;
        else if (this.rank[rootX] < this.rank[rootY]) this.parent[rootX] = rootY;
        else { this.parent[rootY] = rootX; this.rank[rootX] += 1; }
      }
    }
  }

  // homr: bounding_boxes.py:539
  function mergeGroupsOptimized(groups) {
    var n = groups.length, uf = new UnionFind(n), i, j;
    // try to find overlaps and union groups that overlap
    for (i = 0; i < n; i++) for (j = i + 1; j < n; j++) if (doGroupsOverlap(groups[i], groups[j])) uf.union(i, j);
    // merged groups from the union-find results, in the order their roots first appear (dict)
    var merged = new Map();
    for (i = 0; i < n; i++) {
      var root = uf.find(i);
      if (!merged.has(root)) merged.set(root, []);
      Array.prototype.push.apply(merged.get(root), groups[i]);
    }
    return Array.from(merged.values());
  }

  // homr: bounding_boxes.py:560
  function mergeOverlayingBoundingBoxes(boxes) {
    return mergeGroupsOptimized(boxes.map(function (b) { return [b]; }));
  }

  OMR.bounding_boxes = {
    calculateEdgesOfRotatedRectangle: calculateEdgesOfRotatedRectangle,
    doPolygonsOverlap: doPolygonsOverlap,
    DebugDrawable: DebugDrawable, AnyPolygon: AnyPolygon, BoundingBox: BoundingBox,
    AngledBoundingBox: AngledBoundingBox, RotatedBoundingBox: RotatedBoundingBox, BoundingEllipse: BoundingEllipse,
    createRotatedBoundingBoxes: createRotatedBoundingBoxes, createRotatedBoundingBox: createRotatedBoundingBox,
    createLines: createLines, createBoundingEllipses: createBoundingEllipses,
    UnionFind: UnionFind, mergeOverlayingBoundingBoxes: mergeOverlayingBoundingBoxes,
    _hasBoxValidSize: hasBoxValidSize, _doGroupsOverlap: doGroupsOverlap, _mergeGroupsRecursive: mergeGroupsRecursive,
    _mergeGroupsOptimized: mergeGroupsOptimized, _getEllipseForWholeGroup: getEllipseForWholeGroup,
    _getBoxForWholeGroup: getBoxForWholeGroup,
    // helpers for the drawable data
    cssColor: cssColor, boxPolygon: boxPolygon
  };
})(typeof self !== 'undefined' ? self : globalThis);
