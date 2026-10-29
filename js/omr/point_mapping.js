/* soundLAB OMR: port of homr/point_mapping.py (AGPL-3.0, github.com/liebharc/homr).
   Maps points back through the image transformations of the pipeline.

   Every step which moves pixels (autocrop, resizing, staff extraction, dewarping, placing
   the staff on the transformer canvas) contributes one inverse mapping. Chained together
   they take a point from the transformer input back to the image the user provided.
   A point is [x, y]; a mapping is a function point -> point. */
(function (G) {
  'use strict';
  var OMR = G.OMR = G.OMR || {};

  // homr: point_mapping.py:14
  function identity(point) { return point; }

  // homr: point_mapping.py:18
  // Inverse of cropping an image at the top left corner (x, y).
  // Pasting an image at (x, y) is a crop at (-x, -y).
  function undoCrop(x, y) {
    return function (point) { return [point[0] + x, point[1] + y]; };
  }

  // homr: point_mapping.py:30
  // Inverse of resizing an image, the shapes are numpy shapes (height, width, ...).
  function undoResize(shapeBefore, shapeAfter) {
    // int / int in Python: a zero-sized shape raises ZeroDivisionError here
    if (shapeBefore[1] === 0 || shapeBefore[0] === 0) throw OMR.py.error('ZeroDivisionError', 'division by zero');
    var scaleX = shapeAfter[1] / shapeBefore[1];
    var scaleY = shapeAfter[0] / shapeBefore[0];
    return function (point) { return [point[0] / scaleX, point[1] / scaleY]; };
  }

  // homr: point_mapping.py:43
  // Applies the mappings in the given order, so list the inverse of the last
  // transformation first.
  function chain() {
    var mappings = Array.prototype.slice.call(arguments);
    return function (point) {
      for (var i = 0; i < mappings.length; i++) point = mappings[i](point);
      return point;
    };
  }

  OMR.point_mapping = { identity: identity, undoCrop: undoCrop, undoResize: undoResize, chain: chain };
})(typeof self !== 'undefined' ? self : globalThis);
