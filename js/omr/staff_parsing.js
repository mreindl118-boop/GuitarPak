/* soundLAB OMR: port of homr/staff_parsing.py (AGPL-3.0, github.com/liebharc/homr).
   Every staff of the page: cut out, dewarped, placed on the 256 x 1280 transformer canvas,
   read by TrOMR; the results become one voice per staff position of the systems.

   Async boundary: parseStaffImage and parseStaffs return Promises (the transformer);
   everything else (prepareStaffImage, the canvas helpers, the layout helpers) is synchronous.
   parseStaffs takes a JS-only trailing options object {onProgress(staffIndex, staffCount),
   signal (an AbortSignal: checked before each staff)}. */
(function (G) {
  'use strict';
  var OMR = G.OMR = G.OMR || {};
  const np = OMR.np, py = OMR.py, constants = OMR.constants;
  const cv2 = () => OMR.cv2;
  const PM = OMR.point_mapping;
  const V = OMR.transformer_vocabulary;
  const EncodedSymbol = V.EncodedSymbol;

  function eprint() {
    const sl = OMR.simple_logging;
    if (sl && sl.eprint) sl.eprint.apply(null, arguments);
  }
  function pyError(name, message) { const e = new Error(message); e.name = name; e.pyType = name; return e; }
  function rint(x) { return py.round(x); } // np.round / round(): half to even

  const trOmrMaxHeight = OMR.transformer_configs.defaultConfig.maxHeight;
  const trOmrMaxWidth = OMR.transformer_configs.defaultConfig.maxWidth;

  // homr: staff_parsing.py:26
  // imageShape: numpy shape [h, w, ...] -> [width, height] of the content on the canvas
  function getTrOmrCanvasSize(imageShape, marginTop, marginBottom) {
    marginTop = marginTop || 0;
    marginBottom = marginBottom || 0;
    const trOmrMaxHeightWithMargin = trOmrMaxHeight - marginTop - marginBottom;
    const trOmrRatio = trOmrMaxHeightWithMargin / trOmrMaxWidth;
    const height = imageShape[0], width = imageShape[1];
    if (width === 0) throw pyError('ZeroDivisionError', 'division by zero');

    // Calculate the new size such that it fits exactly into the
    // tr_omr_max_height and tr_omr_max_width
    // while maintaining the aspect ratio of height and width.

    let newShape;
    if (height / width > trOmrRatio) {
      // The height is the limiting factor.
      if (height === 0) throw pyError('ZeroDivisionError', 'division by zero');
      newShape = [py.int(width / height * trOmrMaxHeightWithMargin), trOmrMaxHeightWithMargin];
    } else {
      // The width is the limiting factor.
      newShape = [trOmrMaxWidth, py.int(height / width * trOmrMaxWidth)];
    }
    return newShape;
  }

  // homr: staff_parsing.py:49
  function _canvasYOffset(resizedHeight, marginTop, marginBottom) {
    marginTop = marginTop || 0;
    marginBottom = marginBottom || 0;
    const trOmrMaxHeightWithMargin = trOmrMaxHeight - marginTop - marginBottom;
    return py.floorDiv(trOmrMaxHeightWithMargin - resizedHeight, 2) + marginTop;
  }

  // homr: staff_parsing.py:54
  // canvasSize: [width, height]
  function centerImageOnCanvas(image, canvasSize, marginTop, marginBottom) {
    const isGrayscale = image.c === 1;

    const resized = cv2().resize(image, [canvasSize[0], canvasSize[1]]);

    let newImage;
    if (isGrayscale) newImage = np.full([trOmrMaxHeight, trOmrMaxWidth], 255, 'uint8');
    else newImage = np.full([trOmrMaxHeight, trOmrMaxWidth, 3], 255, 'uint8');

    const xOffset = 0;
    const yOffset = _canvasYOffset(resized.h, marginTop, marginBottom);

    np.assign(newImage, yOffset, yOffset + resized.h, xOffset, xOffset + resized.w, resized);

    return newImage;
  }

  // homr: staff_parsing.py:85
  function addImageIntoTrOmrCanvas(image) {
    const newShape = getTrOmrCanvasSize(np.shape(image));
    const newImage = centerImageOnCanvas(image, newShape);
    return newImage;
  }

  // homr: staff_parsing.py:91
  // Blanks (in place, like Python) light boxes of large contours that touch the image edge.
  function removeBlackContoursAtEdgesOfImage(gray, unitSize) {
    let thresh = cv2().threshold(gray, 97, 255, cv2().THRESH_BINARY)[1];
    // cv2.threshold returns None for an empty image, so homr's `255 - thresh` raises; OMR.cv2
    // returns an empty image instead
    if (np.size(thresh) === 0) throw pyError('TypeError', "unsupported operand type(s) for -: 'int' and 'NoneType'");
    thresh = np.map(thresh, (v) => 255 - v, 'uint8');
    const contours = cv2().findContours(thresh, cv2().RETR_TREE, cv2().CHAIN_APPROX_SIMPLE)[0];
    const threshold = constants.blackSpotRemovalThreshold(unitSize);
    for (const cnt of contours) {
      const r = cv2().boundingRect(cnt);
      const x = r[0], y = r[1], w = r[2], h = r[3];
      if (w < threshold || h < threshold) continue;
      const isAtEdgeOfImage = x === 0 || y === 0 || x + w === gray.w || y + h === gray.h;
      if (!isAtEdgeOfImage) continue;
      const averageGrayIntensity = 127;
      const isMostlyDark = np.mean(np.crop(thresh, y, y + h, x, x + w).data) < averageGrayIntensity;
      if (isMostlyDark) continue;
      np.assign(gray, y, y + h, x, x + w, 255);
    }
    return gray;
  }

  // homr: staff_parsing.py:111
  function _calculateRegion(staff, regions) {
    const xMin = staff.minX - 2 * staff.averageUnitSize;
    const xMax = staff.maxX + 2 * staff.averageUnitSize;
    const yMin = py.max2(staff.minY - 4 * staff.averageUnitSize, regions.getStartOfClosestStaffAbove(staff.minY));
    const yMax = py.min2(staff.maxY + 4 * staff.averageUnitSize, regions.getStartOfClosestStaffBelow(staff.maxY));
    return [py.int(xMin), py.int(yMin), py.int(xMax), py.int(yMax)];
  }

  // homr: staff_parsing.py:125
  // Returns the staff image for the transformer, the staff in the coordinates of that image
  // and a mapping from the coordinates of that image back to the coordinates of the page.
  // -> [staffImage, staff, toPage]
  function prepareStaffImage(debug, index, staff, staffImage, regions) {
    let region = _calculateRegion(staff, regions);
    const imageDimensions = getTrOmrCanvasSize([py.int(region[3] - region[1]), py.int(region[2] - region[0])]);
    let scalingFactor = imageDimensions[1] / (region[3] - region[1]);
    const pageShape = np.shape(staffImage);
    staffImage = cv2().resize(staffImage, [py.int(staffImage.w * scalingFactor), py.int(staffImage.h * scalingFactor)]);
    const undoScaling = PM.undoResize(pageShape, np.shape(staffImage));
    region = region.map((v) => rint(v * scalingFactor));
    eprint('Dewarping staff', index);
    const regionStep1 = [region[0] - 10, region[1] - 50, region[2] + 10, region[3] + 50];
    let cr = OMR.image_utils.cropImageAndReturnNewTop(staffImage, regionStep1[0], regionStep1[1], regionStep1[2], regionStep1[3]);
    staffImage = cr[0];
    let topLeft = cr[1];
    const undoCrop1 = PM.undoCrop(topLeft[0], topLeft[1]);
    const regionStep2 = [region[0] - topLeft[0], region[1] - topLeft[1], region[2] - topLeft[0], region[3] - topLeft[1]];
    topLeft = [topLeft[0] / scalingFactor, topLeft[1] / scalingFactor];
    staff = _dewarpStaff(staff, null, topLeft, scalingFactor);
    const dewarp = OMR.staff_dewarping.dewarpStaffImage(staffImage, staff, index, debug);
    staffImage = dewarp.dewarp(staffImage);
    cr = OMR.image_utils.cropImageAndReturnNewTop(staffImage, regionStep2[0], regionStep2[1], regionStep2[2], regionStep2[3]);
    staffImage = cr[0];
    // Python rebinds top_left to the second crop's corner here: the debug drawing below uses it
    topLeft = cr[1];
    const undoCrop2 = PM.undoCrop(topLeft[0], topLeft[1]);
    scalingFactor = 1;

    eprint('Dewarping staff', index, 'done');

    staffImage = removeBlackContoursAtEdgesOfImage(staffImage, staff.averageUnitSize);
    const beforeCanvasShape = np.shape(staffImage);
    staffImage = centerImageOnCanvas(staffImage, imageDimensions);
    const canvasContentShape = [py.int(imageDimensions[1]), py.int(imageDimensions[0])];
    const toPage = PM.chain(
      PM.undoCrop(0, -_canvasYOffset(canvasContentShape[0])),
      PM.undoResize(beforeCanvasShape, canvasContentShape),
      undoCrop2,
      (p) => dewarp.undewarpPoint(p),
      undoCrop1,
      undoScaling
    );
    if (debug && debug.writeImageWithFixedSuffix) debug.writeImageWithFixedSuffix('_staff-' + index + '_input.jpg', staffImage);
    if (debug && debug.debug) {
      const transformedStaff = _dewarpStaff(staff, dewarp, topLeft, scalingFactor);
      const transformedStaffImage = np.clone(staffImage);
      for (const symbol of transformedStaff.symbols) {
        const center = symbol.center;
        cv2().circle(transformedStaffImage, [py.int(center[0]), py.int(center[1])], 5, [0, 0, 255]);
        cv2().putText(transformedStaffImage, symbol.constructor.name, [py.int(center[0]), py.int(center[1])],
          cv2().FONT_HERSHEY_SIMPLEX, 0.3, [0, 0, 255], 1);
      }
      debug.writeImageWithFixedSuffix('_staff-' + index + '_debug_annotated.jpg', transformedStaffImage);
    }
    return [staffImage, staff, toPage];
  }

  // homr: staff_parsing.py:193
  // Applies the same transformation on the staff coordinates as we did on the image.
  function _dewarpStaff(staff, dewarp, region, scaling) {
    function transformCoordinates(point) {
      let x = point[0], y = point[1];
      x -= region[0];
      y -= region[1];
      if (dewarp !== null && dewarp !== undefined) {
        const p = dewarp.dewarpPoint([x, y]);
        x = p[0]; y = p[1];
      }
      x = x * scaling;
      y = y * scaling;
      return [x, y];
    }
    return staff.transformCoordinates(transformCoordinates);
  }

  // homr: staff_parsing.py:213
  function _getSymbolCenter(symbol) {
    if (symbol.coordinates === null || symbol.coordinates === undefined || symbol.rhythm.startsWith('chord')) return null;
    const center = Array.from(symbol.coordinates.data || symbol.coordinates, Number);
    if (center.length < 2 || Number.isNaN(center[0]) || Number.isNaN(center[1])) return null;
    return [center[0], center[1]];
  }

  // homr: staff_parsing.py:222
  // -> Promise<EncodedSymbol[]>
  async function parseStaffImage(debug, index, staff, image, regions, config, pageToInputImage) {
    pageToInputImage = pageToInputImage || PM.identity;
    const prepared = prepareStaffImage(debug, index, staff, image, regions);
    const staffImage = prepared[0], transformedStaff = prepared[1], staffToPage = prepared[2];
    eprint('Running TrOmr inference on staff image', index);
    const result = await OMR.staff_parsing_tromr.parseStaffTromr(transformedStaff, staffImage, config);
    for (const symbol of result) {
      const center = _getSymbolCenter(symbol);
      if (center !== null) symbol.imageCoordinates = pageToInputImage(staffToPage(center));
    }
    if (debug && debug.debug) {
      const resultImage = np.clone(staffImage);
      result.forEach((symbol, i) => {
        const center = _getSymbolCenter(symbol);
        if (center === null) return;
        const centerInt = [py.int(center[0]), py.int(center[1])];
        cv2().circle(resultImage, centerInt, 5, [0, 0, 255], 2);
        cv2().putText(resultImage, i + ': ' + symbol.rhythm, [centerInt[0], centerInt[1] - 10], cv2().FONT_HERSHEY_SIMPLEX, 0.3, [0, 0, 255], 1);
      });
      debug.writeImageWithFixedSuffix('_staff-' + index + '_output.jpg', resultImage);
    }
    return result;
  }

  // itertools.combinations(range(n), k) in Python's (lexicographic) order
  function combinations(n, k) {
    const out = [], idx = [];
    for (let i = 0; i < k; i++) idx.push(i);
    if (k > n) return out;
    for (;;) {
      out.push(idx.slice());
      let i = k - 1;
      while (i >= 0 && idx[i] === i + n - k) i--;
      if (i < 0) return out;
      idx[i]++;
      for (let j = i + 1; j < k; j++) idx[j] = idx[j - 1] + 1;
    }
  }

  // homr: staff_parsing.py:262
  // The staffs of the layout which the staffs of a system are, None if that isn't
  // unique, e.g. a system shows only the piano as the voice is hidden.
  // row / layout: arrays of booleans (is_grandstaff per staff) -> array of slots | null
  function _slotsInLayout(row, layout) {
    const matches = combinations(layout.length, row.length).filter((slots) =>
      slots.every((slot, i) => layout[slot] === row[i]));
    return matches.length === 1 ? matches[0] : null;
  }

  // homr: staff_parsing.py:277
  // For every system the parts which its staffs belong to, the parts are the staffs
  // of the largest system. None if a system doesn't fit into it unambiguously.
  function _assignParts(staffs) {
    const SR = OMR.system_repair;
    const layouts = new Map(); // {_layout(row) for row in staffs}: key -> layout
    for (const row of staffs) {
      const l = SR._layout(row);
      layouts.set(SR.layoutKey(l), l);
    }
    // max(layouts, key=len): which of several equally long layouts a set yields first does not
    // matter, two of them make the next check return None
    const largest = py.max(Array.from(layouts.values()), (l) => l.length);
    const largestKey = SR.layoutKey(largest);
    for (const entry of layouts) {
      if (entry[1].length === largest.length && entry[0] !== largestKey) return null;
    }
    const result = [];
    for (const row of staffs) {
      const slots = _slotsInLayout(SR._layout(row), largest);
      if (slots === null) return null;
      result.push(slots);
    }
    return result;
  }

  // homr: staff_parsing.py:295
  // Rests for a staff which is hidden in a system: one per measure of the symbols
  // another staff of the system has, with the same barlines.
  function _measureRestsLike(symbols, isGrandstaff) {
    const positions = isGrandstaff ? ['upper', 'lower'] : ['upper'];
    const result = [];
    let inMeasure = false;
    for (const symbol of symbols) {
      if ((symbol.rhythm.startsWith('note') || symbol.rhythm.startsWith('rest')) && !inMeasure) {
        positions.forEach((position, i) => {
          if (i > 0) result.push(new EncodedSymbol('chord'));
          result.push(new EncodedSymbol('measureRest', { position: position }));
        });
        inMeasure = true;
      } else if (symbol.rhythm.indexOf('barline') >= 0 || symbol.rhythm.indexOf('repeat') >= 0) {
        result.push(new EncodedSymbol(symbol.rhythm));
        inMeasure = false;
      }
    }
    return result;
  }

  // homr: staff_parsing.py:316
  function _cleanUpVoice(symbols) {
    return OMR.triplet_restoration.restoreUnmarkedTriplets(V.removeDuplicatedSymbols(symbols));
  }

  function tupleRepr(parts) { return '[' + parts.map((p) => '(' + p.join(', ') + (p.length === 1 ? ',' : '') + ')').join(', ') + ']'; }

  // homr: staff_parsing.py:320
  // Dewarps each staff and then runs it through an algorithm which extracts
  // the rhythm and pitch information.
  //
  // page_to_input_image maps the coordinates of image back to the image the user provided,
  // it's used to fill EncodedSymbol.image_coordinates.
  // -> Promise<EncodedSymbol[][]> (one list per voice)
  async function parseStaffs(debug, staffs, image, config, selectedStaff, pageToInputImage, opts) {
    config = config || OMR.transformer_configs.defaultConfig;
    selectedStaff = selectedStaff === undefined || selectedStaff === null ? -1 : selectedStaff;
    pageToInputImage = pageToInputImage || PM.identity;
    opts = opts || {};
    const SR = OMR.system_repair;
    let parts = staffs.map((row) => py.range(row.staffs.length));
    if (new Set(staffs.map((staff) => staff.staffs.length)).size > 1) {
      // The voices are read across systems, a system with fewer staffs hides some
      const assigned = _assignParts(staffs);
      if (assigned === null) {
        eprint('The layout changes on the page, reading every staff on its own');
        staffs = [].concat.apply([], staffs.map((staff) => staff.breakApart()));
        parts = staffs.map(() => [0]);
      } else {
        eprint('Staffs are hidden in some systems, parts of the systems:', tupleRepr(assigned));
        parts = assigned;
      }
    }
    // For simplicity we call every staff in a multi staff a voice,
    // even if it's part of a grand staff.
    const numberOfVoices = py.max(staffs.map((staff) => staff.staffs.length));
    const layoutRow = staffs.find((row) => row.staffs.length === numberOfVoices);
    const layout = SR._layout(layoutRow);
    let i = 0;
    const results = new Map(); // (staff_index, voice) -> symbols
    const key = (staffIndex, voice) => staffIndex + ',' + voice;
    const regions = new OMR.staff_regions.StaffRegions(staffs);
    // JS only: progress over the staffs the transformer will read
    let staffCount = 0;
    for (let voice = 0; voice < numberOfVoices; voice++) {
      staffs.forEach((row, staffIndex) => {
        if (parts[staffIndex].indexOf(voice) >= 0 && !(selectedStaff >= 0 && staffIndex !== selectedStaff)) staffCount++;
      });
    }
    let staffsDone = 0;
    for (let voice = 0; voice < numberOfVoices; voice++) {
      for (let staffIndex = 0; staffIndex < staffs.length; staffIndex++) {
        const row = staffs[staffIndex];
        if (parts[staffIndex].indexOf(voice) < 0) continue;
        if (selectedStaff >= 0 && staffIndex !== selectedStaff) {
          eprint('Ignoring staff due to selected_staff argument', i);
          i += 1;
          continue;
        }
        if (opts.signal && opts.signal.aborted) throw abortError(opts.signal);
        if (opts.onProgress) opts.onProgress(staffsDone, staffCount);
        const staff = row.staffs[parts[staffIndex].indexOf(voice)];
        const resultStaff = await parseStaffImage(debug, i, staff, image, regions, config, pageToInputImage);
        staffsDone++;
        i += 1;
        if (resultStaff.length === 0) {
          eprint('Skipping empty staff', i - 1);
          continue;
        }
        results.set(key(staffIndex, voice), resultStaff);
      }
    }
    if (opts.onProgress) opts.onProgress(staffsDone, staffCount);

    const voices = [];
    for (let voice = 0; voice < numberOfVoices; voice++) {
      const resultForVoice = [];
      parts.forEach((slots, staffIndex) => {
        let symbols = results.has(key(staffIndex, voice)) ? results.get(key(staffIndex, voice)) : null;
        const shown = slots.filter((v) => results.has(key(staffIndex, v))).map((v) => results.get(key(staffIndex, v)));
        if (slots.indexOf(voice) < 0 && shown.length > 0) symbols = _measureRestsLike(shown[0], layout[voice]);
        if (symbols === null) return;
        Array.prototype.push.apply(resultForVoice, symbols);
        resultForVoice.push(new EncodedSymbol('newline'));
      });
      voices.push(_cleanUpVoice(resultForVoice));
    }
    return voices;
  }

  function abortError(signal) {
    if (signal && signal.reason instanceof Error) return signal.reason;
    const e = new Error('The operation was aborted.');
    e.name = 'AbortError';
    return e;
  }

  OMR.staff_parsing = {
    trOmrMaxHeight: trOmrMaxHeight, trOmrMaxWidth: trOmrMaxWidth,
    getTrOmrCanvasSize: getTrOmrCanvasSize, _canvasYOffset: _canvasYOffset, centerImageOnCanvas: centerImageOnCanvas,
    addImageIntoTrOmrCanvas: addImageIntoTrOmrCanvas, removeBlackContoursAtEdgesOfImage: removeBlackContoursAtEdgesOfImage,
    _calculateRegion: _calculateRegion, prepareStaffImage: prepareStaffImage, _dewarpStaff: _dewarpStaff,
    _getSymbolCenter: _getSymbolCenter, parseStaffImage: parseStaffImage, _slotsInLayout: _slotsInLayout,
    _assignParts: _assignParts, _measureRestsLike: _measureRestsLike, _cleanUpVoice: _cleanUpVoice,
    parseStaffs: parseStaffs, _combinations: combinations
  };
})(typeof self !== 'undefined' ? self : globalThis);
