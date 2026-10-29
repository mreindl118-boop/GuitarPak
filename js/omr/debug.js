/* soundLAB OMR: port of homr/debug.py (AGPL-3.0, github.com/liebharc/homr).
   In the browser nothing is written to disk: every write_* method is a no-op with the same
   name, except writeTeaser, which records the shapes homr would draw on the page so the UI
   can paint the preview (debug.teasers[k] = {filename, width, height, items}). */
(function (G) {
  'use strict';
  var OMR = G.OMR = G.OMR || {};

  // os.path.dirname / os.path.join (posixpath) for the debug file names
  function dirname(p) {
    var head = p.slice(0, p.lastIndexOf('/') + 1);
    if (head && !/^\/+$/.test(head)) head = head.replace(/\/+$/, '');
    return head;
  }
  function joinPath(a, b) {
    if (b.charAt(0) === '/' || !a) return b;
    return a.charAt(a.length - 1) === '/' ? a + b : a + '/' + b;
  }

  // homr: debug.py:12
  class Debug {
    constructor(originalImage, filename, debug) {
      this.filename = filename;
      this.originalImage = originalImage;
      filename = String(filename || '').replace(/\\/g, '/');
      this.dirName = dirname(filename);
      this.baseFilename = joinPath(this.dirName, filename.split('/').pop().split('.')[0]);
      this.debug = !!debug;
      // BGR like cv2 (green, red, blue, cyan, yellow, magenta, ...)
      this.colors = [
        [0, 255, 0], [0, 0, 255], [255, 0, 0], [255, 255, 0], [0, 255, 255],
        [255, 0, 255], [255, 165, 0], [255, 182, 193], [128, 0, 128], [64, 224, 208]
      ];
      this.debugOutputCounter = 0;
      this.writtenFiles = [];
      this.teasers = []; // the browser addition: what writeTeaser drew
    }
    // homr: debug.py:35 (no files in the browser)
    cleanDebugFilesFromPreviousRuns() {}
    // homr: debug.py:46
    _debugFileName(suffix) {
      this.debugOutputCounter += 1;
      return this.baseFilename + '_debug_' + this.debugOutputCounter + '_' + suffix + '.png';
    }
    _rememberFileName(filename) { this.writtenFiles.push(filename); }
    // The writers below draw / write nothing in the browser, but with debug on they keep
    // Python's bookkeeping: each numbered file advances the counter that later debug file
    // names (and writeBoundingBoxesAlternatingColors' teasers) carry, and is remembered.
    // homr: debug.py:50
    writeThresholdImage(suffix, image) {
      if (!this.debug) return;
      this._rememberFileName(this._debugFileName(suffix));
    }
    // homr: debug.py:60
    writeBoundingBoxes(suffix, boundingBoxes) {
      if (!this.debug) return;
      this._rememberFileName(this._debugFileName(suffix));
    }
    // homr: debug.py:70
    writeImage(suffix, image) {
      if (!this.debug) return;
      this._rememberFileName(this._debugFileName(suffix));
    }
    // homr: debug.py:77
    writeImageWithFixedSuffix(suffix, image) {
      if (!this.debug) return;
      this._rememberFileName(this.baseFilename + suffix);
    }
    // homr: debug.py:84
    writeAllBoundingBoxesAlternatingColors(suffix) {
      var all = [];
      for (var i = 1; i < arguments.length; i++) all = all.concat(Array.from(arguments[i]));
      this.writeBoundingBoxesAlternatingColors(suffix, all);
    }
    // homr: debug.py:89
    writeBoundingBoxesAlternatingColors(suffix, boundingBoxes) {
      if (!this.debug) return;
      this.writeTeaser(this._debugFileName(suffix), boundingBoxes);
    }
    // homr: debug.py:96
    // Python draws every box onto a copy of the page in an alternating colour and writes it;
    // here the shapes are recorded: items = [{type, ..., color: [b, g, r], css}] in drawing order
    writeTeaser(filename, boundingBoxes) {
      var items = [];
      for (var i = 0; i < boundingBoxes.length; i++) {
        var color = this.colors[i % this.colors.length];
        Array.prototype.push.apply(items, boundingBoxes[i].toDrawable(color));
      }
      var img = this.originalImage;
      var teaser = { filename: filename, width: img ? img.w : 0, height: img ? img.h : 0, items: items };
      this._rememberFileName(filename);
      this.teasers.push(teaser);
      return teaser;
    }
    // homr: debug.py:104
    // These files aren't really debug files, but it's convenient to handle them here so that
    // they are cleaned up together with the debug files (transformer / OCR inputs). The browser
    // writes nothing and returns the name Python would have used.
    writeModelInputImage(suffix, staffImage) {
      var filename = this.baseFilename + suffix;
      if (this.debug) this._rememberFileName(filename);
      return filename;
    }
  }

  // for tests / debugging: what Python's draw_onto_image does, on an image (needs opencv.js)
  function drawTeaser(image, boundingBoxes, colors) {
    var img = OMR.np.clone(image);
    colors = colors || new Debug(null, '', false).colors;
    for (var i = 0; i < boundingBoxes.length; i++) boundingBoxes[i].drawOntoImage(img, colors[i % colors.length]);
    return img;
  }

  OMR.debug = { Debug: Debug, drawTeaser: drawTeaser, _dirname: dirname, _joinPath: joinPath };
})(typeof self !== 'undefined' ? self : globalThis);
