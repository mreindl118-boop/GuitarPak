/* soundLAB OMR: port of homr/note_detection.py (AGPL-3.0, github.com/liebharc/homr).
   Noteheads + stems -> notes on the staffs. Rects (cv2.typing.Rect tuples) are arrays
   [x1, y1, x2, y2] of ints; the notehead mask is a 0/1 uint8 image. */
(function (G) {
  'use strict';
  var OMR = G.OMR = G.OMR || {};
  var np = OMR.np, py = OMR.py, constants = OMR.constants, bb = OMR.bounding_boxes, model = OMR.model;
  var DebugDrawable = bb.DebugDrawable, BoundingEllipse = bb.BoundingEllipse;
  var eprint = function () { OMR.simple_logging.eprint.apply(null, arguments); };

  // homr: note_detection.py:11
  class NoteheadWithStem extends DebugDrawable {
    constructor(notehead, stem, stemDirection) {
      super();
      this.notehead = notehead;
      this.stem = stem;
      this.stemDirection = stemDirection === undefined ? null : stemDirection;
    }
    // homr: note_detection.py:22
    drawOntoImage(img, color) {
      color = color || [255, 0, 0];
      this.notehead.drawOntoImage(img, color);
      if (this.stem !== null) this.stem.drawOntoImage(img, color);
    }
    toDrawable(color) {
      color = color || [255, 0, 0];
      var items = this.notehead.toDrawable(color);
      if (this.stem !== null) Array.prototype.push.apply(items, this.stem.toDrawable(color));
      return items;
    }
  }

  // homr: note_detection.py:28
  function adjustBbox(bbox, noteheads) {
    // noteheads[y1:y2, x1:x2] with numpy's slice rules (a negative start counts from the end)
    var ys = np.sliceBounds(bbox[1], bbox[3], noteheads.h), xs = np.sliceBounds(bbox[0], bbox[2], noteheads.w);
    var top = -1, bottom = -1, w = noteheads.w, d = noteheads.data;
    for (var y = ys[0]; y < ys[1]; y++) {
      for (var x = xs[0]; x < xs[1]; x++) {
        if (d[y * w + x] > 0) { if (top < 0) top = y - ys[0]; bottom = y - ys[0]; break; }
      }
    }
    if (top < 0) {
      // Invalid note. Will be eliminated with zero height.
      return bbox;
    }
    return [bbox[0], py.int(top + bbox[1] - 1), bbox[2], py.int(bottom + bbox[1] + 1)];
  }

  // homr: note_detection.py:39
  function getCenter(bbox) {
    var cenY = py.int(py.round((bbox[1] + bbox[3]) / 2));
    var cenX = py.int(py.round((bbox[0] + bbox[2]) / 2));
    return [cenX, cenY];
  }

  // homr: note_detection.py:45
  function checkBboxSize(bbox, noteheads, unitSize) {
    var w = bbox[2] - bbox[0];
    var h = bbox[3] - bbox[1];
    var cenX = getCenter(bbox)[0];
    var noteW = constants.noteheadSizeRatio * unitSize;
    var noteH = unitSize;

    var newBbox = [];
    if (Math.abs(w - noteW) > Math.abs(w - noteW * 2)) {
      // Contains at least two notes, one left and one right.
      var leftBox = [bbox[0], bbox[1], cenX, bbox[3]];
      var rightBox = [cenX, bbox[1], bbox[2], bbox[3]];

      // Upper and lower bounds could have changed
      leftBox = adjustBbox(leftBox, noteheads);
      rightBox = adjustBbox(rightBox, noteheads);

      // Check recursively
      if (leftBox !== null) Array.prototype.push.apply(newBbox, checkBboxSize(leftBox, noteheads, unitSize));
      if (rightBox !== null) Array.prototype.push.apply(newBbox, checkBboxSize(rightBox, noteheads, unitSize));
    }

    // Check height
    if (newBbox.length > 0) {
      var tmpNew = [];
      newBbox.forEach(function (box) { Array.prototype.push.apply(tmpNew, checkBboxSize(box, noteheads, unitSize)); });
      newBbox = tmpNew;
    } else {
      var numNotes = py.int(py.round(h / noteH));
      if (numNotes > 0) {
        var subH = py.floorDiv(h, numNotes);
        for (var i = 0; i < numNotes; i++) {
          newBbox.push([bbox[0], py.round(bbox[1] + i * subH), bbox[2], py.round(bbox[1] + (i + 1) * subH)]);
        }
      }
    }
    return newBbox;
  }

  // homr: note_detection.py:90
  // Note heads might be clumped together by the notehead detection algorithm.
  function splitClumpsOfNoteheads(notehead, noteheads, staff) {
    var bbox = [
      py.int(notehead.notehead.topLeft[0]),
      py.int(notehead.notehead.topLeft[1]),
      py.int(notehead.notehead.bottomRight[0]),
      py.int(notehead.notehead.bottomRight[1])
    ];
    var splitBoxes = checkBboxSize(bbox, noteheads, staff.averageUnitSize);
    if (splitBoxes.length <= 1) return [notehead];
    var result = [];
    splitBoxes.forEach(function (box) {
      var center = getCenter(box);
      var size = [box[2] - box[0], box[3] - box[1]];
      notehead = new NoteheadWithStem(
        new BoundingEllipse([center, size, 0], notehead.notehead.contours, notehead.notehead.debugId),
        notehead.stem,
        notehead.stemDirection
      );
      result.push(notehead);
    });
    return result;
  }

  // homr: note_detection.py:120
  // Combines noteheads with their stems as this tells us
  // what vertical lines are stems and which are bar lines.
  function combineNoteheadsWithStems(noteheads, stems) {
    var result = [];
    noteheads = py.sorted(noteheads, function (notehead) { return notehead.box[0][1]; });
    var usedStems = new Set();
    noteheads.forEach(function (notehead) {
      var thickenedNotehead = notehead.makeBoxThicker(15);
      var foundStem = false;
      for (var i = 0; i < stems.length; i++) {
        var stem = stems[i];
        if (stem.isOverlapping(thickenedNotehead)) {
          var isStemAbove = stem.center[1] < notehead.center[1];
          var direction = isStemAbove ? model.StemDirection.UP : model.StemDirection.DOWN;
          result.push(new NoteheadWithStem(notehead, stem, direction));
          usedStems.add(stem.key());
          foundStem = true;
          break;
        }
      }
      if (!foundStem) result.push(new NoteheadWithStem(notehead, null, null));
    });
    return result;
  }

  // homr: note_detection.py:149
  function addNotesToStaffs(staffs, noteheads, symbols, noteheadPred) {
    var result = [];
    staffs.forEach(function (staff) {
      noteheads.forEach(function (noteheadChunk) {
        if (!staff.isOnStaffZone(noteheadChunk.notehead)) return;
        var center = noteheadChunk.notehead.center;
        var point = staff.getAt(center[0]);
        if (point === null) return;
        if (noteheadChunk.notehead.size[0] < 0.5 * point.averageUnitSize ||
            noteheadChunk.notehead.size[1] < 0.5 * point.averageUnitSize) return;
        splitClumpsOfNoteheads(noteheadChunk, noteheadPred, staff).forEach(function (notehead) {
          point = staff.getAt(center[0]);
          if (point === null) return;
          if (notehead.notehead.size[0] < 0.5 * point.averageUnitSize ||
              notehead.notehead.size[0] > 3 * point.averageUnitSize ||
              notehead.notehead.size[1] < 0.5 * point.averageUnitSize ||
              notehead.notehead.size[1] > 2 * point.averageUnitSize) return;
          var position = point.findPositionInUnitSizes(notehead.notehead);
          var note = new model.Note(notehead.notehead, position, notehead.stem, notehead.stemDirection);
          result.push(note);
          staff.addSymbol(note);
        });
      });
    });
    var numberOfNotes = 0;
    staffs.forEach(function (staff) { numberOfNotes += staff.getNotes().length; });
    eprint('Found', numberOfNotes, 'notes during segmentation');
    return result;
  }

  OMR.note_detection = {
    NoteheadWithStem: NoteheadWithStem, adjustBbox: adjustBbox, getCenter: getCenter, checkBboxSize: checkBboxSize,
    splitClumpsOfNoteheads: splitClumpsOfNoteheads, combineNoteheadsWithStems: combineNoteheadsWithStems,
    addNotesToStaffs: addNotesToStaffs
  };
})(typeof self !== 'undefined' ? self : globalThis);
