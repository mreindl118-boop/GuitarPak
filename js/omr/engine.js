/* soundLAB OMR engine: homr's main.py (github.com/liebharc/homr, AGPL-3.0) and the owner's SheetLab
   engine around it (tools/sheetlab_engine.py: SheetMusicTranslator.translate_file), ported to run in a
   Web Worker (js/omr/worker.js) and in Node (tests/omr-e2e.test.js).

   OMR.main   = homr/main.py: getPredictions, loadAndPreprocessPredictions, predictSymbols,
                detectStaffsInImage (from the predictions on, as the parity suites call it) and
                detectStaffsInPage (= main.detect_staffs_in_image(image_path, config) on a decoded
                page). No title OCR, no file IO, no staff position files.
   OMR.engine = the SheetLab engine: preprocessSheetImage, maybeSplitLandscapeSpread, analyzePage
                (= _analyze_single_page_image), Translation (page by page: addPage / finish) and
                translate(pages, options, hooks) (= translate_file after the PDF / image decoding).

   Deliberate deviations from the Python engine (each one where Python fails for reasons outside
   recognition, or the browser has no equivalent):
   - Repeats music21 cannot expand (ExpanderException) made the engine fail the WHOLE file (no MIDI).
     Here the MIDI is written without repeat expansion (OMR.midi's lenient default) and
     result.warnings says so; the MusicXML keeps the repeats.
   - A title with characters XML 1.0 forbids (e.g. a control character in PDF metadata) made
     music21's parser fail (no MIDI). Here such characters are removed from the title first.
   - homr now raises 'No noteheads or clefs found' where the engine (written for an older homr)
     looks for 'No noteheads found': any message starting with 'No noteheads' (or containing
     'No noteheads found' / 'No staffs found', the engine's own test) is a cover page
     ('Non-music / cover page (...)'), the engine's evident intent.
   - A failure while making the MIDI keeps the MusicXML / .mxl in the result (success false,
     errorMessage set); Python returned nothing.
   - Exports: the chosen GM instrument is written into the MusicXML part-list (score-instrument /
     instrument-name, instrument-sound, midi-instrument / midi-program 1-based) of the .musicxml and
     .mxl, so notation apps open it with that instrument (the Python .musicxml kept homr's 'Voice' /
     'Piano'; its .mxl was music21's re-export with both instruments, inner name <stem>_out.musicxml;
     here <stem>.musicxml, OMR.mxl). The .mid is made from homr's own MusicXML exactly like the
     engine (OMR.midi.convert: byte-identical to music21 + mido). music21's MusicXML export, which
     made the engine fail some files, is never needed.
   - Pages are analysed as they arrive (Python first preprocessed every page to a PNG, then
     analysed them): preprocessing draws no random numbers, so the results are the same; the
     progress fraction uses the page total when it is known up front (translate()), else an
     estimate (Translation.addPage meta.totalPages).
   - Cancellation (hooks.cancelled(), checked between pages, segmentation batches and staffs)
     resolves with {success: false, cancelled: true}; pool work still finishing after that reports
     no more progress.
   - Each Translation starts from a fresh cv::theRNG (one Python process per file) and keeps its own
     state between its pages, so documents interleaved in one worker read exactly as they would alone.
   - The low-res upscale (cv2.resize INTER_CUBIC on uint8) follows Intel IPP, which the x86
     opencv-python wheels use for it (resizeCubicU8: all but ~0.001 % of the values, near-ties at .5);
     opencv.js' fixed-point cubic differs in ~1-5 % of the values (cv2 without IPP, e.g. on ARM, too).
   - Title fallback: Python's str.title() of the file stem, exact for Unicode 14 (Python 3.11); the few
     characters whose case properties changed in later Unicode versions follow the browser's.
   - Gray pages (1 channel) are accepted (made BGR); RGBA pictures are composited over white by the
     worker (imageFromRgba), where PIL's convert('RGB') drops alpha (a transparent PNG turns black).

   PARALLEL POOL (opts.pool): an object {size, segnet(data, dims) -> Promise<Uint8Array[]>,
   staff(image) -> Promise<EncodedSymbol[]>} whose workers each hold their own sessions
   (js/omr/worker.js builds one from nested helper workers; OMR.engine.localPool() runs the same
   tasks in this thread). Segmentation sends whole batches of 8 tiles (the int8 segnet's
   DynamicQuantizeLinear scales by the whole batch: never re-batch) and merges them in tile order;
   the staffs run as a dry pass of parseStaffs that records every transformer input in order (and
   dispatches it at once), then the real pass gets the recorded results back in the same order.
   The results are bit-identical to the single-thread path (tests/omr-e2e.test.js checks it). */
(function (G) {
  'use strict';
  var OMR = G.OMR = G.OMR || {};

  function eprint() {
    const sl = OMR.simple_logging;
    if (sl && sl.eprint) sl.eprint.apply(null, arguments);
  }
  const nowMs = () => (G.performance && G.performance.now ? G.performance.now() : Date.now());
  function pyError(name, msg) { const e = new Error(msg); e.name = name; e.pyType = name; return e; }

  // ============================================================================================
  // homr: main.py
  // ============================================================================================

  // homr: main.py:85 get_predictions (async: it runs the segnet). extra: {onProgress(tiles done,
  // total), signal, pool} (JS only; a pool runs the segnet batches in parallel, same masks)
  async function getPredictions(original, preprocessed, imgPath, enableCache, segnetUseGpu, extra) {
    extra = extra || {};
    const cv2 = OMR.cv2;
    const result = extra.pool
      ? await segmentPooled(preprocessed, imgPath, extra.pool, extra)
      : await OMR.inference_segnet.extract(preprocessed, imgPath,
        { stepSize: 320, useCache: enableCache, useGpuInference: segnetUseGpu, onProgress: extra.onProgress, signal: extra.signal });
    const originalImage = cv2.resize(original, [result.staff.w, result.staff.h]);
    const preprocessedImage = cv2.resize(preprocessed, [result.staff.w, result.staff.h]);
    // (homr casts the int64 masks to uint8: they are uint8 0/1 here already)
    return new OMR.model.InputPredictions(originalImage, preprocessedImage, result.notehead, result.symbols,
      result.staff, result.clefsKeys, result.stemsRests);
  }

  // homr: main.py:116 load_and_preprocess_predictions. image = the decoded page (BGR uint8, what
  // cv2.imread gives homr); imagePath only names the debug files.
  // -> Promise<[predictions, debug, toInputImage]>
  async function loadAndPreprocessPredictions(image, imagePath, enableDebug, enableCache, segnetUseGpu, extra) {
    if (!image || !image.data) {
      throw pyError('InvalidProgramArgumentException', 'The file format is not supported, please provide a JPG or PNG image file:' + imagePath);
    }
    const PM = OMR.point_mapping;
    const ac = OMR.autocrop.autocropWithOffset(image);
    image = ac[0];
    const cropTopLeft = ac[1];
    const croppedShape = OMR.np.shape(image);
    image = OMR.resize.resizeImage(image);
    const preprocessed = OMR.color_adjust.applyClahe(image);
    let predictions = await getPredictions(image, preprocessed, imagePath, enableCache, segnetUseGpu, extra);
    const toInputImage = PM.chain(PM.undoResize(croppedShape, OMR.np.shape(predictions.preprocessed)),
      PM.undoCrop(cropTopLeft[0], cropTopLeft[1]));
    const debug = new OMR.debug.Debug(predictions.original, imagePath, enableDebug);
    debug.writeImage('color_adjust', preprocessed);

    predictions = OMR.noise_filtering.filterPredictions(predictions, debug);

    predictions.staff = OMR.staff_detection.makeLinesStronger(predictions.staff, [1, 2]);
    debug.writeThresholdImage('staff', predictions.staff);
    debug.writeThresholdImage('symbols', predictions.symbols);
    debug.writeThresholdImage('stems_rest', predictions.stemsRest);
    debug.writeThresholdImage('notehead', predictions.notehead);
    debug.writeThresholdImage('clefs_keys', predictions.clefsKeys);
    return [predictions, debug, toInputImage];
  }

  // homr: main.py:149 (verified by tests/omr-staff.test.js and tests/omr-boxes.test.js)
  function predictSymbols(debug, predictions) {
    const bbx = OMR.bounding_boxes, BL = OMR.bar_line_detection;
    eprint('Creating bounds for noteheads');
    const noteheads = bbx.createBoundingEllipses(predictions.notehead, { minSize: [4, 4] });
    eprint('Creating bounds for staff_fragments');
    const staffFragments = bbx.createRotatedBoundingBoxes(predictions.staff, { skipMerging: true, minSize: [5, 1], maxSize: [10000, 100] });
    eprint('Creating bounds for clefs_keys');
    const clefsKeys = bbx.createRotatedBoundingBoxes(predictions.clefsKeys, { minSize: [20, 40], maxSize: [1000, 1000] });
    eprint('Creating bounds for stems_rest');
    const stemsRest = bbx.createRotatedBoundingBoxes(predictions.stemsRest);
    eprint('Creating bounds for bar_lines');
    const barLineImg = BL.prepareBarLineImage(predictions.stemsRest);
    debug.writeThresholdImage('bar_line_img', barLineImg);
    const barLines = bbx.createRotatedBoundingBoxes(barLineImg, { skipMerging: true, minSize: [1, 5] });
    return { noteheads, staffFragments, clefsKeys, stemsRest, barLines };
  }

  // homr: main.py:263 detect_staffs_in_image, from the predictions on (load_and_preprocess_predictions
  // is the caller's: detectStaffsInPage; no title detection). rec (optional) receives the
  // intermediates dump_stages writes into 07-staff.json. -> [multiStaffs, preprocessed, debug, nStaffs]
  function detectStaffsInImage(predictions, debug, rec) {
    const np = OMR.np, bbx = OMR.bounding_boxes, BL = OMR.bar_line_detection;
    const SD = OMR.staff_detection, ND = OMR.note_detection, BD = OMR.brace_dot_detection;
    rec = rec || {};
    const symbols = predictSymbols(debug, predictions);
    rec.symbols = symbols;

    symbols.staffFragments = SD.breakWideFragments(symbols.staffFragments);
    rec.staffFragments = symbols.staffFragments;
    debug.writeBoundingBoxes('staff_fragments', symbols.staffFragments);
    eprint('Found ' + symbols.staffFragments.length + ' staff line fragments');

    const noteheadsWithStems = ND.combineNoteheadsWithStems(symbols.noteheads, symbols.stemsRest);
    rec.noteheadsWithStems = noteheadsWithStems;
    debug.writeBoundingBoxesAlternatingColors('notehead_with_stems', noteheadsWithStems);
    eprint('Found ' + noteheadsWithStems.length + ' noteheads');
    let averageNoteHeadHeight;
    if (noteheadsWithStems.length > 0) {
      averageNoteHeadHeight = np.median(noteheadsWithStems.map((notehead) => notehead.notehead.size[1]));
    } else {
      const unitSize = SD.estimateUnitSizeFromClefs(symbols.staffFragments, symbols.clefsKeys);
      rec.unitSizeFromClefs = unitSize;
      if (unitSize === null) throw OMR.py.error('Exception', 'No noteheads or clefs found');
      averageNoteHeadHeight = unitSize;
    }
    rec.averageNoteHeadHeight = averageNoteHeadHeight;
    eprint('Average note head height: ' + OMR.py.floatRepr(averageNoteHeadHeight)); // str(float)

    const allNoteheads = noteheadsWithStems.map((notehead) => notehead.notehead);
    const allStems = noteheadsWithStems.filter((note) => note.stem !== null).map((note) => note.stem);
    const barLinesOrRests = symbols.barLines.filter((line) =>
      !line.isOverlappingWithAny(allNoteheads) && !line.isOverlappingWithAny(allStems));
    rec.barLinesOrRests = barLinesOrRests;
    const barLineBoxes = BL.detectBarLines(barLinesOrRests, averageNoteHeadHeight);
    rec.barLineBoxes = barLineBoxes;
    debug.writeBoundingBoxesAlternatingColors('bar_lines', barLineBoxes);
    eprint('Found ' + barLineBoxes.length + ' bar lines');

    debug.writeBoundingBoxes('anchor_input', symbols.staffFragments.concat(barLineBoxes, symbols.clefsKeys));
    const staffs = SD.detectStaff(debug, predictions.staff, symbols.staffFragments, symbols.clefsKeys, barLineBoxes);
    rec.staffs = staffs;
    if (staffs.length === 0) throw OMR.py.error('Exception', 'No staffs found');
    // (title detection: off)
    debug.writeBoundingBoxesAlternatingColors('staffs', staffs);

    const braceDotImg = BD.prepareBraceDotImage(predictions.symbols, predictions.staff);
    rec.braceDotImg = braceDotImg;
    debug.writeThresholdImage('brace_dot', braceDotImg);
    const braceDot = bbx.createRotatedBoundingBoxes(braceDotImg, { skipMerging: true, maxSize: [100, -1] });
    rec.braceDot = braceDot;

    const notes = ND.addNotesToStaffs(staffs, noteheadsWithStems, predictions.symbols, predictions.notehead);
    rec.notes = notes;

    const multiStaffs = BD.findBracesBracketsAndGrandStaffLines(debug, staffs, braceDot);
    rec.multiStaffs = multiStaffs;
    eprint('Found', multiStaffs.length, 'connected staffs (after merging grand staffs, multiple voices): ',
      '[' + multiStaffs.map((staff) => staff.staffs.length).join(', ') + ']');

    debug.writeAllBoundingBoxesAlternatingColors('notes', multiStaffs, notes);
    return [multiStaffs, predictions.preprocessed, debug, staffs.length];
  }

  // homr: main.py:192 ProcessingConfig (what the SheetLab engine passes; title detection is not
  // ported, staff position files have no place in the browser)
  class ProcessingConfig {
    constructor(enableDebug, enableCache, writeStaffPositions, readStaffPositions, selectedStaff,
      transformerUseGpu, segnetUseGpu, coremlEncoder, titleDetection) {
      this.enableDebug = !!enableDebug;
      this.enableCache = !!enableCache;
      this.writeStaffPositions = !!writeStaffPositions;
      this.readStaffPositions = !!readStaffPositions;
      this.selectedStaff = selectedStaff === undefined ? -1 : selectedStaff;
      this.transformerUseGpu = !!transformerUseGpu;
      this.segnetUseGpu = !!segnetUseGpu;
      this.coremlEncoder = !!coremlEncoder;
      this.titleDetection = !!titleDetection;
    }
  }
  // the engine's: ProcessingConfig(False, False, False, False, -1, use_gpu, use_gpu, False, False)
  // with use_gpu = cuda_available() = False on every browser
  function sheetLabConfig() { return new ProcessingConfig(false, false, false, false, -1, false, false, false, false); }

  // homr: main.py:263 detect_staffs_in_image(image_path, config) on a decoded page.
  // -> Promise<[multiStaffs, preprocessed, debug, title (''), nStaffs, toInputImage]>
  async function detectStaffsInPage(image, imagePath, config, extra) {
    config = config || sheetLabConfig();
    extra = extra || {};
    const r = await loadAndPreprocessPredictions(image, imagePath, config.enableDebug, config.enableCache, config.segnetUseGpu, extra);
    const predictions = r[0], debug = r[1], toInputImage = r[2];
    if (extra.onSegmented) extra.onSegmented(predictions);
    const d = detectStaffsInImage(predictions, debug, extra.rec);
    return [d[0], d[1], debug, '', d[3], toInputImage];
  }

  OMR.main = {
    ProcessingConfig, getPredictions, loadAndPreprocessPredictions, predictSymbols, detectStaffsInImage,
    detectStaffsInPage, sheetLabConfig
  };

  // ============================================================================================
  // the parallel pool: tasks a helper runs, and the pooled versions of segmentation / reading
  // ============================================================================================

  let segnetPromise = null, s2sPromise = null;
  // onnxruntime-web runs one model at a time per thread: two runs in flight on the same wasm instance
  // (e.g. two staffs' decoders) corrupt each other ("output name cannot be empty"). Tasks in this
  // thread therefore run one after the other; a helper worker gets one task at a time anyway.
  let taskChain = Promise.resolve();
  function serial(fn) {
    const p = taskChain.then(fn);
    taskChain = p.catch(() => {});
    return p;
  }
  // one segnet batch -> per tile the class map (np.argmax over the 6 classes, Uint8Array per tile),
  // exactly what inference_segnet.inference keeps of a batch
  function taskSegnet(data, dims) { return serial(() => runSegnet(data, dims)); }
  async function runSegnet(data, dims) {
    if (!segnetPromise) {
      segnetPromise = OMR.inference_segnet.Segnet.create(false);
      segnetPromise.catch(() => { segnetPromise = null; });
    }
    const segnet = await segnetPromise;
    const out = await segnet.run({ data: data, dims: dims });
    const k = out.dims[1], plane = dims[2] * dims[3], maps = [];
    for (let b = 0; b < dims[0]; b++) maps.push(OMR.inference_segnet._argmaxTile(out.data, b, k, plane));
    return maps;
  }
  // one staff image (256 x 1280 uint8 canvas) -> Staff2Score.predict's symbols (predict_best's
  // grand staff filter stays with the caller)
  function taskStaff(image) { return serial(() => runStaff(image)); }
  async function runStaff(image) {
    if (!s2sPromise) {
      s2sPromise = OMR.transformer_staff2score.Staff2Score.create(OMR.transformer_configs.defaultConfig);
      s2sPromise.catch(() => { s2sPromise = null; });
    }
    const s2s = await s2sPromise;
    return s2s.predict(image);
  }
  // EncodedSymbols across postMessage: the six fields + the decoder's attention (Float32Array(2))
  function encodeSymbols(list) {
    return list.map((s) => [s.rhythm, s.pitch, s.lift, s.articulation, s.slur, s.position, s.coordinates]);
  }
  function decodeSymbols(list) {
    const V = OMR.transformer_vocabulary;
    return list.map((a) => new V.EncodedSymbol(a[0], a[1], a[2], a[3], a[4], a[5], a[6] == null ? null : a[6]));
  }
  // the tasks in this thread (tests; the worker's fallback when no helper is left)
  function localPool() {
    return {
      size: 1, local: true,
      segnet: (data, dims) => taskSegnet(data, dims),
      staff: (image) => taskStaff(image)
    };
  }
  function releaseTasks() { segnetPromise = null; s2sPromise = null; }

  function abortErr(signal) {
    if (signal && signal.reason instanceof Error) return signal.reason;
    const e = new Error('The operation was aborted.');
    e.name = 'AbortError';
    return e;
  }
  // run fn(i) for i < n with at most `limit` running; resolves when all are done (first error wins)
  function runLimited(n, limit, fn) {
    return new Promise((resolve, reject) => {
      let next = 0, running = 0, done = 0, failed = false;
      if (n === 0) { resolve(); return; }
      const launch = () => {
        while (!failed && running < limit && next < n) {
          const i = next++;
          running++;
          Promise.resolve().then(() => fn(i)).then(() => {
            running--; done++;
            if (done === n) resolve(); else launch();
          }, (e) => { failed = true; reject(e); });
        }
      };
      launch();
    });
  }

  // inference_segnet.extract(preprocessed, path, step_size=320) (batch 8, window 320) with the
  // batches run by the pool: the same tiles in the same batches, merged in tile order
  async function segmentPooled(gray, imgPath, pool, extra) {
    const IS = OMR.inference_segnet, cv2 = OMR.cv2;
    const winSize = 320, stepSize = 320, batchSize = 8;
    eprint('Starting Inference.');
    const t0 = nowMs();
    const imageOrg = cv2.cvtColor(gray, cv2.COLOR_GRAY2BGR);
    const c = imageOrg.c, h = imageOrg.h, w = imageOrg.w;
    const tiles = [];
    for (let y0 = 0; y0 < Math.max(h, winSize); y0 += stepSize) {
      const y = Math.min(y0, h - winSize);
      for (let x0 = 0; x0 < Math.max(w, winSize); x0 += stepSize) tiles.push([y, Math.min(x0, w - winSize)]);
    }
    const total = tiles.length, plane = winSize * winSize, tileSize = c * plane;
    const nBatches = Math.ceil(total / batchSize), results = new Array(nBatches);
    let doneTiles = 0, stopped = false;
    if (extra.onProgress) extra.onProgress(0, total);
    try {
      await runLimited(nBatches, Math.max(1, (pool.size || 1) + 1), async (bi) => {
        if (stopped || (extra.signal && extra.signal.aborted)) throw abortErr(extra.signal);
        const first = bi * batchSize, n = Math.min(batchSize, total - first);
        const buf = new Float32Array(n * tileSize);
        for (let t = 0; t < n; t++) IS.extractPatch(imageOrg, tiles[first + t][0], tiles[first + t][1], winSize, buf, t * tileSize);
        const maps = await pool.segnet(buf, [n, c, winSize, winSize]);
        if (!maps || maps.length !== n) throw new Error('OMR pool: a segnet batch returned ' + (maps && maps.length) + ' tiles, expected ' + n);
        // a batch that comes back after the page stopped (cancel / another batch failed) reports nothing
        if (stopped) return;
        results[bi] = maps;
        doneTiles += n;
        if (extra.onProgress) extra.onProgress(doneTiles, total);
      });
    } catch (e) {
      stopped = true;
      throw e;
    }
    const data = [].concat.apply([], results);
    eprint('Segnet Inference time: ' + ((nowMs() - t0) / 1000) + '; batch_size ' + batchSize);
    const merged = IS.mergePatches(data, [h, w], winSize, stepSize);
    const cls = (k) => {
      const m = new Uint8Array(merged.data.length), md = merged.data;
      for (let i = 0; i < md.length; i++) m[i] = md[i] === k ? 1 : 0;
      return { h: merged.h, w: merged.w, c: 1, data: m };
    };
    // extract() also resizes the original to the masks' size; get_predictions does not use it
    return new IS.ExtractResult(imgPath, gray, cls(4), cls(5), cls(1), cls(2), cls(3));
  }

  function sameImage(a, b) {
    if (!a || !b || a.h !== b.h || a.w !== b.w || a.c !== b.c || a.data.length !== b.data.length) return false;
    const x = a.data, y = b.data;
    for (let i = 0; i < x.length; i++) if (x[i] !== y[i]) return false;
    return true;
  }
  // staff_parsing.parse_staffs with the transformer calls run by the pool. Pass 1 runs parseStaffs
  // with a stand-in that records each transformer input in call order and hands it to the pool at
  // once (and answers []); pass 2 runs parseStaffs again with a stand-in that returns the recorded
  // results in the same order (checking that the input is the same image). prepare_staff_image is
  // deterministic and leaves the staffs and the page unchanged, so both passes see the same inputs.
  async function parseStaffsPooled(debug, multiStaffs, image, config, pool, opts) {
    const SPT = OMR.staff_parsing_tromr, SP = OMR.staff_parsing, identity = OMR.point_mapping.identity;
    const saved = SPT._getInference();
    const recorded = [];
    let loopDone = false, done = 0, stopped = false;
    // (staffs that come back after the page stopped report nothing)
    const report = () => { if (!stopped && opts.onProgress) opts.onProgress(done, recorded.length); };
    try {
      SPT._setInference({
        predict(img) {
          const p = Promise.resolve().then(() => pool.staff(img));
          p.then(() => { done++; if (loopDone) report(); }, () => {});
          recorded.push({ img: img, p: p });
          return [];
        }
      });
      try {
        await SP.parseStaffs(debug, multiStaffs, image, config, -1, identity, {
          onProgress: (i, n) => { if (i === n) loopDone = true; }
        });
      } catch (e) {
        // an exception inside the staff loop (e.g. prepare_staff_image) recurs at the same staff in
        // the real pass: raise it as Python would; one after the loop comes from the empty answers
        if (!loopDone) throw e;
      }
      report();
      let k = 0;
      SPT._setInference({
        async predict(img) {
          const r = recorded[k++];
          if (r && sameImage(r.img, img)) return r.p;
          eprint('OMR pool: staff input ' + (k - 1) + ' differs from the dry pass, reading it again');
          return pool.staff(img);
        }
      });
      return await SP.parseStaffs(debug, multiStaffs, image, config, -1, identity, { signal: opts.signal });
    } catch (e) {
      stopped = true;
      throw e;
    } finally {
      SPT._setInference(saved);
    }
  }

  // ============================================================================================
  // the SheetLab engine (tools/sheetlab_engine.py)
  // ============================================================================================

  function gm() { return OMR.midi.GM_INSTRUMENTS; }
  // MusicXML standard instrument sounds (sounds.xml) for the engine's menu, by GM program
  const GM_SOUNDS = {
    0: 'keyboard.piano.grand', 1: 'keyboard.piano', 3: 'keyboard.piano.honky-tonk', 4: 'keyboard.piano.electric',
    6: 'keyboard.harpsichord', 8: 'keyboard.celesta', 10: 'pitched-percussion.music-box', 11: 'pitched-percussion.vibraphone',
    12: 'pitched-percussion.marimba', 19: 'keyboard.organ.pipe', 21: 'keyboard.accordion', 24: 'pluck.guitar.nylon-string',
    25: 'pluck.guitar.steel-string', 26: 'pluck.guitar.electric', 27: 'pluck.guitar.electric', 32: 'pluck.bass.acoustic',
    40: 'strings.violin', 41: 'strings.viola', 42: 'strings.cello', 48: 'strings.group', 52: 'voice.aa', 56: 'brass.trumpet',
    57: 'brass.trombone', 60: 'brass.french-horn', 65: 'wind.reed.saxophone.alto', 66: 'wind.reed.saxophone.tenor',
    68: 'wind.reed.oboe', 71: 'wind.reed.clarinet', 73: 'wind.flutes.flute'
  };

  // sheetlab_engine.py preprocess_sheet_image: strip a dark scan frame, upscale low-res scans
  // (+ unsharp mask). bgr: an OMR.np BGR uint8 image -> a new image
  function preprocessSheetImage(bgr, upscaleLowRes) {
    const np = OMR.np, cv2 = OMR.cv2, py = OMR.py;
    if (upscaleLowRes === undefined) upscaleLowRes = true;
    let img = np.clone(bgr);
    let h = img.h, w = img.w;

    // Strip solid dark outer scan frames (e.g. Vinyl Booklet scans)
    const gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY);
    const parts = [np.crop(gray, 0, 8, null, null), np.crop(gray, -8, null, null, null),
      np.crop(gray, null, null, 0, 8), np.crop(gray, null, null, -8, null)];
    let n = 0;
    for (const p of parts) n += p.data.length;
    const border = new Uint8Array(n);
    let o = 0;
    for (const p of parts) { border.set(p.data, o); o += p.data.length; }
    if (medianU8(border) < 65) {
      // cv2.threshold(gray, 110, 255, THRESH_BINARY) -> cv2.findNonZero -> cv2.boundingRect
      let x0 = Infinity, y0 = Infinity, x1 = -1, y1 = -1;
      const gd = gray.data;
      for (let y = 0; y < gray.h; y++) {
        const row = y * gray.w;
        for (let x = 0; x < gray.w; x++) {
          if (gd[row + x] > 110) {
            if (x < x0) x0 = x;
            if (x > x1) x1 = x;
            if (y < y0) y0 = y;
            y1 = y;
          }
        }
      }
      if (x1 >= 0) { // coords is not None
        const x = x0, y = y0, bw = x1 - x0 + 1, bh = y1 - y0 + 1;
        if (bw > w * 0.6 && bh > h * 0.6) {
          img = np.crop(img, y, y + bh, x, x + bw);
          h = img.h; w = img.w;
        }
      }
    }

    // Upscale low-resolution images so noteheads have enough pixels
    if (upscaleLowRes && Math.min(h, w) < 1050) {
      const scale = 1450.0 / Math.min(h, w);
      const newW = py.int(py.round(w * scale));
      const newH = py.int(py.round(h * scale));
      // cv2.resize(img, (new_w, new_h), interpolation=cv2.INTER_CUBIC): see resizeCubicU8
      img = resizeCubicU8(img, newW, newH);
      const blurred = cv2.GaussianBlur(img, [0, 0], 1.2);
      img = cv2.addWeighted(img, 1.35, blurred, -0.35, 0);
    }
    return img;
  }
  // cv2.resize(..., INTER_CUBIC) of a uint8 image as the x86 opencv-python wheels compute it (the owner's
  // PC, the references): cv2 hands uint8 cubic resizes to Intel IPP there, which filters in floating
  // point, where opencv.js (and cv2 without IPP, e.g. on ARM) uses 11-bit fixed-point weights; those
  // differ by +-1 in ~1-5 % of the values. This separable float32 filter (OpenCV's cubic weights,
  // A = -0.75, computed in double and stored as float32; rows first; each pass
  // (w0*s0 + w1*s1) + (w2*s2 + w3*s3) in float32; replicated border; round half to even, saturate)
  // matches IPP on all but ~0.001 % of the values (near-ties at .5; tests/omr-e2e.test.js 'prep').
  function cubicTaps(nOut, nIn) {
    const idx = new Int32Array(nOut * 4), w = new Float32Array(nOut * 4), s = nIn / nOut, A = -0.75;
    for (let d = 0; d < nOut; d++) {
      const f = (d + 0.5) * s - 0.5, sx = Math.floor(f), x = f - sx;
      const c0 = ((A * (x + 1) - 5 * A) * (x + 1) + 8 * A) * (x + 1) - 4 * A;
      const c1 = ((A + 2) * x - (A + 3)) * x * x + 1;
      const c2 = ((A + 2) * (1 - x) - (A + 3)) * (1 - x) * (1 - x) + 1;
      const c3 = 1 - c0 - c1 - c2;
      const cs = [c0, c1, c2, c3];
      for (let k = 0; k < 4; k++) {
        const i = sx + k - 1;
        idx[d * 4 + k] = i < 0 ? 0 : i > nIn - 1 ? nIn - 1 : i;
        w[d * 4 + k] = cs[k];
      }
    }
    return [idx, w];
  }
  function resizeCubicU8(img, nw, nh) {
    const fr = Math.fround, c = img.c, src = img.data, h = img.h, w = img.w;
    const tx = cubicTaps(nw, w), ty = cubicTaps(nh, h), ix = tx[0], wx = tx[1], iy = ty[0], wy = ty[1];
    const hp = new Float32Array(h * nw * c);
    for (let y = 0; y < h; y++) {
      const row = y * w * c, orow = y * nw * c;
      for (let x = 0; x < nw; x++) {
        const k = x * 4, a0 = row + ix[k] * c, a1 = row + ix[k + 1] * c, a2 = row + ix[k + 2] * c, a3 = row + ix[k + 3] * c;
        const w0 = wx[k], w1 = wx[k + 1], w2 = wx[k + 2], w3 = wx[k + 3];
        for (let ch = 0; ch < c; ch++) {
          hp[orow + x * c + ch] = fr(fr(fr(src[a0 + ch] * w0) + fr(src[a1 + ch] * w1)) + fr(fr(src[a2 + ch] * w2) + fr(src[a3 + ch] * w3)));
        }
      }
    }
    const out = new Uint8Array(nh * nw * c), rowLen = nw * c;
    for (let y = 0; y < nh; y++) {
      const k = y * 4, r0 = iy[k] * rowLen, r1 = iy[k + 1] * rowLen, r2 = iy[k + 2] * rowLen, r3 = iy[k + 3] * rowLen;
      const w0 = wy[k], w1 = wy[k + 1], w2 = wy[k + 2], w3 = wy[k + 3], o = y * rowLen;
      for (let i = 0; i < rowLen; i++) {
        const v = fr(fr(fr(hp[r0 + i] * w0) + fr(hp[r1 + i] * w1)) + fr(fr(hp[r2 + i] * w2) + fr(hp[r3 + i] * w3)));
        let r = Math.round(v);
        if (r - v === 0.5 && r % 2 !== 0) r -= 1; // np.rint: half to even
        out[o + i] = r < 0 ? 0 : r > 255 ? 255 : r;
      }
    }
    return { h: nh, w: nw, c: c, data: out };
  }

  // np.median of uint8 values (float64: the mean of the two middle values for an even count)
  function medianU8(a) {
    if (!a.length) return NaN;
    const counts = new Uint32Array(256);
    for (let i = 0; i < a.length; i++) counts[a[i]]++;
    const kth = (k) => { let s = 0; for (let v = 0; v < 256; v++) { s += counts[v]; if (s > k) return v; } return 255; };
    const m = a.length >> 1;
    return a.length % 2 ? kth(m) : (kth(m - 1) + kth(m)) / 2;
  }

  // sheetlab_engine.py maybe_split_landscape_spread: a wide 2-page booklet scan (width > 1.32 x
  // height, at least 1800 px) -> [['Left', left], ['Right', right]] (1 % overlap), else [['', bgr]]
  function maybeSplitLandscapeSpread(bgr, enableSplit) {
    if (enableSplit === undefined) enableSplit = true;
    const h = bgr.h, w = bgr.w;
    if (enableSplit && w > h * 1.32 && w >= 1800) {
      const mid = Math.floor(w / 2);
      const overlap = OMR.py.int(w * 0.01);
      const leftPage = OMR.np.crop(bgr, null, null, null, mid + overlap);
      const rightPage = OMR.np.crop(bgr, null, null, mid - overlap, null);
      return [['Left', leftPage], ['Right', rightPage]];
    }
    return [['', bgr]];
  }
  // how many pages maybe_split_landscape_spread makes of an image of this size (no pixels needed)
  function splitCount(w, h, enableSplit) {
    if (enableSplit === undefined) enableSplit = true;
    return enableSplit && w > h * 1.32 && w >= 1800 ? 2 : 1;
  }

  // the engine's skip rule on str(exc) (see the header: homr's newer 'No noteheads or clefs found')
  function skipReason(msg) {
    if (msg.indexOf('No noteheads found') >= 0 || msg.indexOf('No staffs found') >= 0 || msg.startsWith('No noteheads')) {
      return 'Non-music / cover page (' + msg + ')';
    }
    return 'OMR skipped page (' + msg + ')';
  }
  function isCancel(e) { return !!e && (e.name === 'AbortError' || e.omrCancel === true); }
  // Python's str(exc) of what the ports raise (their messages are Python's)
  function excText(e) {
    if (e === null || e === undefined) return 'None';
    if (typeof e === 'string') return e;
    return e.message !== undefined ? String(e.message) : String(e);
  }
  function excName(e) {
    if (!e || typeof e !== 'object') return 'Exception';
    return e.pyType || e.name || 'Exception';
  }

  // diagnostics (opts.recordStaffs): every transformer call of a page, in call order: the sha1 of its
  // input image and the symbols it read (raw, before predict_best's filter), through the pool path
  // (a local pool when there is none: the same results)
  function recordingPool(base, log) {
    let n = 0;
    return {
      size: base.size, local: base.local,
      segnet: (data, dims) => base.segnet(data, dims),
      staff: async (img) => {
        const i = n++;
        let sha1 = null;
        try {
          const subtle = G.crypto && G.crypto.subtle;
          if (subtle) {
            const d = new Uint8Array(await subtle.digest('SHA-1', img.data));
            sha1 = Array.from(d, (b) => b.toString(16).padStart(2, '0')).join('');
          }
        } catch (e) { /* no digest here */ }
        const out = await base.staff(img);
        log[i] = { sha1: sha1, shape: [img.h, img.w], tokens: out.map(String) };
        return out;
      }
    };
  }

  // sheetlab_engine.py _analyze_single_page_image on a page as the engine saves it (BGR uint8).
  // opts: {pageNumber, label, imagePath, pool, signal, debug (homr's debug flag), onStage(info),
  //        onStaffs(teaser)}. -> Promise<analysis>: {pageNumber, label, staffCount, voiceCount,
  // skippedReason (null | text), voices (EncodedSymbol lists), teaser ({filename, width, height,
  // items} of the systems, homr's _teaser.png as drawables) | null, timings {detect, read, total} ms}
  async function analyzePage(image, opts) {
    opts = opts || {};
    const analysis = {
      pageNumber: opts.pageNumber || 1, label: opts.label || 'Page 1', staffCount: 0, voiceCount: 0,
      skippedReason: null, voices: [], teaser: null, timings: {}
    };
    const t0 = nowMs();
    const stage = (s) => { if (opts.onStage) { try { opts.onStage(Object.assign({ label: analysis.label }, s)); } catch (e) { /* UI */ } } };
    const imagePath = opts.imagePath || ('page_' + String(analysis.pageNumber).padStart(3, '0') + '.png');
    let pool = opts.pool || null;
    if (opts.recordStaffs) pool = recordingPool(pool || localPool(), analysis.staffs = []);
    try {
      const config = sheetLabConfig();
      config.enableDebug = !!opts.debug;
      const det = await detectStaffsInPage(image, imagePath, config, {
        pool: pool, signal: opts.signal,
        onProgress: (d, n) => stage({ stage: 'segment', done: d, total: n }),
        onSegmented: () => stage({ stage: 'staffs', done: 0, total: 1 })
      });
      let multiStaffs = det[0];
      const preprocessedImg = det[1], debug = det[2];
      multiStaffs = OMR.system_repair.repairSystems(debug, multiStaffs);
      analysis.staffCount = multiStaffs.reduce((s, ms) => s + ms.staffs.length, 0);
      analysis.timings.detect = Math.round(nowMs() - t0);
      const teaserName = imagePath.replace(/\.[^./]*$/, '') + '_teaser.png';
      const early = new OMR.debug.Debug(debug.originalImage, imagePath, false).writeTeaser(teaserName, multiStaffs);
      if (opts.onStaffs) { try { opts.onStaffs(early, analysis.staffCount); } catch (e) { /* UI */ } }

      // transformer_config = Config(); use_gpu_inference = False (the int8 models on WASM)
      const transformerConfig = OMR.transformer_configs.defaultConfig;
      const t1 = nowMs();
      const readProgress = (d, n) => stage({ stage: 'read', done: d, total: n });
      const voices = pool
        ? await parseStaffsPooled(debug, multiStaffs, preprocessedImg, transformerConfig, pool, { signal: opts.signal, onProgress: readProgress })
        : await OMR.staff_parsing.parseStaffs(debug, multiStaffs, preprocessedImg, transformerConfig, config.selectedStaff,
          OMR.point_mapping.identity, { signal: opts.signal, onProgress: readProgress });
      analysis.timings.read = Math.round(nowMs() - t1);
      analysis.voices = voices;
      analysis.voiceCount = voices.length;
      // (detected_title: title detection is off)
      analysis.teaser = debug.writeTeaser(teaserName, multiStaffs);
    } catch (exc) {
      if (isCancel(exc)) throw exc;
      const msg = excText(exc);
      analysis.skippedReason = skipReason(msg);
      analysis.error = { name: excName(exc), message: msg };
      if (!exc || !exc.pyType) eprint('OMR page error: ' + (exc && exc.stack ? exc.stack : msg));
    }
    analysis.timings.total = Math.round(nowMs() - t0);
    return analysis;
  }

  // ---- titles: Python's str.strip / str.title, XML 1.0 characters, Path.stem ----
  const PY_SPACE = '\t\n\x0b\x0c\r\x1c\x1d\x1e\x1f \x85\xa0\u1680\u2000\u2001\u2002\u2003\u2004\u2005\u2006' +
    '\u2007\u2008\u2009\u200a\u2028\u2029\u202f\u205f\u3000';
  function pyStrip(s) {
    let a = 0, b = s.length;
    while (a < b && PY_SPACE.includes(s[a])) a++;
    while (b > a && PY_SPACE.includes(s[b - 1])) b--;
    return s.slice(a, b);
  }
  // characters XML 1.0 allows: #x9 | #xA | #xD | [#x20-#xD7FF] | [#xE000-#xFFFD] | [#x10000-#x10FFFF]
  function stripXmlForbidden(s) {
    let out = '';
    for (const ch of String(s)) {
      const c = ch.codePointAt(0);
      if (c === 0x9 || c === 0xa || c === 0xd || (c >= 0x20 && c <= 0xd7ff) || (c >= 0xe000 && c <= 0xfffd) || c >= 0x10000) out += ch;
    }
    return out;
  }
  // Path(name).stem: the last suffix removed (not for '.name' or 'name.')
  function pathStem(name) {
    name = String(name || '').split(/[\\/]/).pop();
    const i = name.lastIndexOf('.');
    return i > 0 && i < name.length - 1 ? name.slice(0, i) : name;
  }
  // str.title(): full titlecase mapping after an uncased character, full lowercase after a cased one
  // (Unicode's Cased / Case_Ignorable properties, Final_Sigma). The titlecase forms that differ from
  // the uppercase ones (SpecialCasing + the digraphs; Python 3.11 / Unicode 14):
  const TITLE_EXC = {
    0xdf: 'Ss', 0x1c4: '\u01c5', 0x1c5: '\u01c5', 0x1c6: '\u01c5', 0x1c7: '\u01c8', 0x1c8: '\u01c8', 0x1c9: '\u01c8',
    0x1ca: '\u01cb', 0x1cb: '\u01cb', 0x1cc: '\u01cb', 0x1f1: '\u01f2', 0x1f2: '\u01f2', 0x1f3: '\u01f2', 0x587: '\u0535\u0582',
    0x1fb2: '\u1fba\u0345', 0x1fb3: '\u1fbc', 0x1fb4: '\u0386\u0345', 0x1fb7: '\u0391\u0342\u0345', 0x1fbc: '\u1fbc',
    0x1fc2: '\u1fca\u0345', 0x1fc3: '\u1fcc', 0x1fc4: '\u0389\u0345', 0x1fc7: '\u0397\u0342\u0345', 0x1fcc: '\u1fcc',
    0x1ff2: '\u1ffa\u0345', 0x1ff3: '\u1ffc', 0x1ff4: '\u038f\u0345', 0x1ff7: '\u03a9\u0342\u0345', 0x1ffc: '\u1ffc',
    0xfb00: 'Ff', 0xfb01: 'Fi', 0xfb02: 'Fl', 0xfb03: 'Ffi', 0xfb04: 'Ffl', 0xfb05: 'St', 0xfb06: 'St',
    0xfb13: '\u0544\u0576', 0xfb14: '\u0544\u0565', 0xfb15: '\u0544\u056b', 0xfb16: '\u054e\u0576', 0xfb17: '\u0544\u056d'
  };
  let CASED = null, CASE_IGN = null;
  function titleChar(ch) {
    const c = ch.codePointAt(0);
    if (TITLE_EXC[c] !== undefined) return TITLE_EXC[c];
    if (c >= 0x1f80 && c <= 0x1faf) return String.fromCodePoint(c | 0x8); // Greek with ypogegrammeni: the titlecase letter
    if ((c >= 0x10d0 && c <= 0x10fa) || (c >= 0x10fd && c <= 0x10ff)) return ch; // Georgian Mkhedruli: its own titlecase
    return ch.toUpperCase();
  }
  function pyTitle(s) {
    if (!CASED) { CASED = /\p{Cased}/u; CASE_IGN = /\p{Case_Ignorable}/u; }
    const cps = Array.from(String(s));
    let out = '', prevCased = false;
    for (let i = 0; i < cps.length; i++) {
      const ch = cps[i];
      if (!prevCased) out += titleChar(ch);
      else if (ch === '\u03a3') { // handle_capital_sigma: Final_Sigma context
        let j = i - 1;
        while (j >= 0 && CASE_IGN.test(cps[j])) j--;
        let fin = j >= 0 && CASED.test(cps[j]);
        if (fin && i + 1 < cps.length) {
          j = i + 1;
          while (j < cps.length && CASE_IGN.test(cps[j])) j++;
          fin = j === cps.length || !CASED.test(cps[j]);
        }
        out += fin ? '\u03c2' : '\u03c3';
      } else out += ch.toLowerCase();
      prevCased = CASED.test(ch);
    }
    return out;
  }
  // translate_file's fallback: src.stem.replace('-', ' ').replace('_', ' ').title()
  function titleFromName(sourceName) {
    return pyTitle(pathStem(sourceName).replace(/-/g, ' ').replace(/_/g, ' '));
  }
  // a title as the engine would use it (PDF metadata .strip()), minus characters XML 1.0 forbids
  function cleanTitle(t) {
    if (t === null || t === undefined) return '';
    return pyStrip(stripXmlForbidden(pyStrip(String(t))));
  }

  // the chosen GM instrument in the MusicXML part-list: instrument-name, instrument-sound (the
  // MusicXML sound for the program; removed for programs outside the engine's menu) and the 1-based
  // midi-program of every score-part
  function setPartInstrument(xml, program, instrumentName) {
    const X = OMR.xml;
    const doc = X.parse(xml);
    const list = X.find(doc.root, 'part-list');
    if (!list) return xml;
    const setText = (el, text) => { el.children = [{ type: 'text', text: String(text) }]; };
    const child = (parent, name, after) => {
      let el = X.find(parent, name);
      if (!el) {
        el = { type: 'element', name: name, attrs: {}, children: [] };
        const kids = parent.children;
        let at = 0;
        for (let i = 0; i < kids.length; i++) if (kids[i].type === 'element' && after.indexOf(kids[i].name) >= 0) at = i + 1;
        kids.splice(at, 0, el);
      }
      return el;
    };
    for (const sp of X.childElements(list, 'score-part')) {
      const id = sp.attrs.id || 'P1';
      const si = child(sp, 'score-instrument', ['part-name', 'part-name-display', 'part-abbreviation', 'part-abbreviation-display', 'group']);
      if (!si.attrs.id) si.attrs.id = id + '-I1';
      setText(child(si, 'instrument-name', []), instrumentName);
      const sound = GM_SOUNDS[program];
      const snd = X.find(si, 'instrument-sound');
      if (sound) setText(child(si, 'instrument-sound', ['instrument-name', 'instrument-abbreviation']), sound);
      else if (snd) si.children.splice(si.children.indexOf(snd), 1);
      const mi = child(sp, 'midi-instrument', ['score-instrument', 'player', 'midi-device']);
      if (!mi.attrs.id) mi.attrs.id = si.attrs.id;
      setText(child(mi, 'midi-program', ['midi-channel', 'midi-name', 'midi-bank']), program + 1);
    }
    return X.serialize(doc);
  }

  // the BGR page a decoded RGBA picture (canvas ImageData) gives the engine: composited over WHITE
  // first. (PIL's convert('RGB') drops alpha, so a transparent PNG becomes black there.)
  function imageFromRgba(w, h, rgba) {
    const n = w * h, out = new Uint8Array(n * 3);
    if (rgba.length < n * 4) throw new RangeError('OMR.engine.imageFromRgba: ' + rgba.length + ' bytes for ' + w + ' x ' + h);
    for (let i = 0, j = 0; i < n; i++, j += 4) {
      const a = rgba[j + 3], o = i * 3;
      if (a === 255) { out[o] = rgba[j + 2]; out[o + 1] = rgba[j + 1]; out[o + 2] = rgba[j]; }
      else if (a === 0) { out[o] = 255; out[o + 1] = 255; out[o + 2] = 255; }
      else {
        const k = 255 * (255 - a);
        out[o] = Math.round((rgba[j + 2] * a + k) / 255);
        out[o + 1] = Math.round((rgba[j + 1] * a + k) / 255);
        out[o + 2] = Math.round((rgba[j] * a + k) / 255);
      }
    }
    return { h: h, w: w, c: 3, data: out };
  }

  function friendlyWarning(w) {
    if (/^repeats not expanded/i.test(w)) {
      return 'The repeats could not be expanded (' + w.replace(/^repeats not expanded:\s*/i, '') +
        '): the MIDI plays the music as written, without repeating sections.';
    }
    return w;
  }

  const DEFAULTS = {
    tempoBpm: 112, instrumentName: 'Acoustic Grand Piano', program: null, transposeSemitones: 0,
    splitWideSpreads: true, upscaleLowRes: true, title: '', sourceName: '', pool: null, resetRng: true, debug: false
  };
  function normalizeOptions(o) {
    o = Object.assign({}, DEFAULTS, o || {});
    for (const k of Object.keys(DEFAULTS)) if (o[k] === undefined) o[k] = DEFAULTS[k];
    o.tempoBpm = Number(o.tempoBpm);
    if (!Number.isFinite(o.tempoBpm) || o.tempoBpm <= 0) throw new RangeError('OMR.engine: tempoBpm must be a positive number, not ' + o.tempoBpm);
    if (o.program === null || o.program === '') {
      const table = gm();
      o.program = Object.prototype.hasOwnProperty.call(table, o.instrumentName) ? table[o.instrumentName] : 0; // GM_INSTRUMENTS.get(name, 0)
    }
    o.program = Number(o.program);
    if (!Number.isInteger(o.program) || o.program < 0 || o.program > 127) throw new RangeError('OMR.engine: program must be 0..127, not ' + o.program);
    o.instrumentName = String(o.instrumentName == null ? DEFAULTS.instrumentName : o.instrumentName);
    o.transposeSemitones = Number(o.transposeSemitones || 0);
    if (!Number.isInteger(o.transposeSemitones)) throw new RangeError('OMR.engine: transposeSemitones must be a whole number, not ' + o.transposeSemitones);
    o.splitWideSpreads = !!o.splitWideSpreads;
    o.upscaleLowRes = !!o.upscaleLowRes;
    o.sourceName = String(o.sourceName || '');
    return o;
  }

  // translate_file from "Step 1" on, one page at a time:
  //   const t = new Translation(options, hooks); t.start(); await t.addPage(bgr, 'Page 1'); ...; await t.finish()
  // hooks: {progress(fraction, message) (the engine's progress_fn: same fractions and texts),
  //         page(analysis summary) after each analysed page, cancelled() -> bool, stage(info) (JS only:
  //         {stage: 'segment' | 'staffs' | 'read', done, total, label}), staffs(label, teaser, n) (JS:
  //         the systems found, before the transformer reads them), log(message)}
  class Translation {
    constructor(options, hooks) {
      this.options = normalizeOptions(options);
      this.hooks = hooks || {};
      const o = this.options;
      this.result = {
        success: false, cancelled: false, title: '', errorMessage: '', pagesProcessed: 0, pagesSkipped: 0,
        totalMeasures: 0, totalNotes: 0, totalChords: 0, durationSeconds: 0, pageSummaries: [], warnings: [],
        musicxml: '', midi: null, mxl: null, xmlRaw: '', pages: [], noteEvents: [], repeatsExpanded: true,
        sourceName: o.sourceName, tempoBpm: o.tempoBpm, program: o.program, instrumentName: o.instrumentName,
        transposeSemitones: o.transposeSemitones, timings: { pages: [] }
      };
      // pdf_title = metadata title .strip(); if pdf_title: result.title = pdf_title
      const t = cleanTitle(o.title);
      if (t) this.result.title = t;
      this.validPages = [];
      this.count = 0;           // analysed pages (after spreads are split)
      this.totalPages = 0;      // Python's total_pages (len(page_inputs)) when known, else an estimate
      this.started = false;
      this.finished = false;
      const self = this;
      const cancelErr = new Error('Cancelled');
      cancelErr.name = 'AbortError';
      cancelErr.omrCancel = true;
      this.cancelErr = cancelErr;
      this.signal = { get aborted() { return self.isCancelled(); }, reason: cancelErr };
    }
    isCancelled() {
      try { return !!(this.hooks.cancelled && this.hooks.cancelled()); } catch (e) { return false; }
    }
    progress(p, msg) {
      p = Math.max(0, Math.min(1, p));
      if (this.hooks.progress) { try { this.hooks.progress(p, msg); } catch (e) { /* UI */ } }
      if (this.hooks.log) { try { this.hooks.log(msg); } catch (e) { /* UI */ } }
    }
    // progress(0.05, f"Loading {src.name}...") and a fresh cv::theRNG (a new Python process)
    start() {
      if (this.started) return;
      this.started = true;
      this.t0 = nowMs();
      if (this.options.resetRng !== false) OMR.cv2.resetRNG();
      // this document's own cv::theRNG state, put back before each of its pages: a worker that
      // interleaves two documents gives each the draws it would get alone (a process per file)
      this.rng = OMR.cv2._rngState ? OMR.cv2._rngState() : null;
      this.progress(0.05, 'Loading ' + (this.options.sourceName.split(/[\\/]/).pop() || 'sheet music') + '...'); // src.name
    }
    // one decoded page (BGR). label: 'Page N' (the spread halves become 'Page N (Left)' / '(Right)').
    // meta: {totalPages: pages after splitting, when known; else sourcePages: pages of the file}
    async addPage(image, label, meta) {
      meta = meta || {};
      this.start();
      if (this.finished) throw new Error('OMR.engine: addPage after finish');
      if (this.isCancelled()) throw this.cancelErr;
      const o = this.options;
      if (image && image.c === 1) image = OMR.cv2.cvtColor(image, OMR.cv2.COLOR_GRAY2BGR); // the engine reads BGR
      const splits = maybeSplitLandscapeSpread(image, o.splitWideSpreads);
      image = null;
      if (meta.totalPages) this.totalPages = meta.totalPages;
      else {
        const seen = this.count + splits.length;
        const rest = meta.sourcePages && meta.pageIndex !== undefined ? Math.max(0, meta.sourcePages - meta.pageIndex - 1) : 0;
        this.totalPages = Math.max(this.totalPages, seen + rest);
      }
      const out = [];
      for (const s of splits) {
        const side = s[0];
        let prep = preprocessSheetImage(s[1], o.upscaleLowRes);
        s[1] = null;
        const lbl = (label || ('Page ' + (this.count + 1))) + (side ? ' (' + side + ')' : '');
        const i = this.count++;
        const total = Math.max(this.totalPages, this.count);
        const frac = 0.12 + 0.65 * (i / Math.max(1, total));
        this.progress(frac, 'Recognizing musical notation on ' + lbl + ' (' + (i + 1) + '/' + total + ')...');
        const width = prep.w, height = prep.h;
        if (this.rng) OMR.cv2._rngState(this.rng);
        const analysis = await analyzePage(prep, {
          pageNumber: i + 1, label: lbl, pool: o.pool, signal: this.signal, debug: o.debug, recordStaffs: !!o.recordStaffs,
          onStage: this.hooks.stage,
          onStaffs: this.hooks.staffs ? (teaser, n) => this.hooks.staffs(lbl, teaser, n) : null
        });
        if (this.rng) this.rng = OMR.cv2._rngState();
        prep = null;
        if (this.isCancelled()) throw this.cancelErr;
        const r = this.result;
        let summary;
        if (analysis.skippedReason || !analysis.voices.length) {
          r.pagesSkipped += 1;
          const reason = analysis.skippedReason || 'No musical voices detected';
          summary = lbl + ': Skipped \u2014 ' + reason;
        } else {
          r.pagesProcessed += 1;
          this.validPages.push(analysis);
          // (detected_title: title detection is off)
          summary = lbl + ': Detected ' + analysis.staffCount + ' staff(s), ' + analysis.voiceCount + ' part(s)';
        }
        r.pageSummaries.push(summary);
        const info = {
          pageNumber: analysis.pageNumber, label: lbl, staffCount: analysis.staffCount, voiceCount: analysis.voiceCount,
          skippedReason: analysis.skippedReason || (analysis.voices.length ? null : 'No musical voices detected'),
          summary: summary, width: width, height: height,
          teaser: analysis.teaser ? analysis.teaser.items : null,
          teaserWidth: analysis.teaser ? analysis.teaser.width : 0, teaserHeight: analysis.teaser ? analysis.teaser.height : 0,
          error: analysis.error || null, timings: analysis.timings
        };
        if (analysis.staffs) info.staffs = analysis.staffs;
        r.pages.push(info);
        r.timings.pages.push(Object.assign({ label: lbl }, analysis.timings));
        out.push(info);
        if (this.hooks.page) { try { this.hooks.page(info, analysis); } catch (e) { /* UI */ } }
      }
      return out;
    }
    // Step 3 (merge, MusicXML) and step 4 (MIDI, exports). -> Promise<result>
    async finish() {
      this.start();
      if (this.finished) return this.result;
      this.finished = true;
      const r = this.result, o = this.options;
      const V = OMR.transformer_vocabulary, MX = OMR.music_xml_generator;
      if (this.isCancelled()) return this.cancelled();
      const validPages = this.validPages;
      if (!validPages.length) {
        r.errorMessage = 'No musical staves or noteheads could be detected in this file.';
        return this.done();
      }
      // src.stem...title() is not stripped by the engine (only characters XML 1.0 forbids go here)
      if (!r.title) r.title = stripXmlForbidden(titleFromName(o.sourceName));

      // Step 3: Merge voices across all valid pages into unified score
      this.progress(0.80, 'Merging staves and generating MusicXML 4.0...');
      let xml;
      try {
        const maxVoices = Math.max.apply(null, validPages.map((p) => p.voices.length));
        const mergedVoices = [];
        for (let v = 0; v < maxVoices; v++) mergedVoices.push([]);
        for (const p of validPages) {
          for (let vIdx = 0; vIdx < maxVoices; vIdx++) {
            if (vIdx < p.voices.length) Array.prototype.push.apply(mergedVoices[vIdx], p.voices[vIdx]);
            else if (p.voices.length === 1 && vIdx === 0) Array.prototype.push.apply(mergedVoices[0], p.voices[0]); // as written (unreachable)
          }
        }
        const cleanedVoices = mergedVoices.filter((v) => v.length > 0).map((v) => V.removeDuplicatedSymbols(v));
        const xmlRoot = MX.generateXml(new MX.XmlGeneratorArguments(false, o.tempoBpm, o.tempoBpm), cleanedVoices, r.title);
        xml = MX.toXmlString(xmlRoot);
      } catch (exc) {
        r.errorMessage = excName(exc) + ': ' + excText(exc);
        return this.done();
      }
      r.xmlRaw = xml;
      if (this.isCancelled()) return this.cancelled();

      // Step 4: tempo / instrument / transposition, MIDI and the exports
      this.progress(0.88, 'Synthesizing MIDI & MusicXML formats...');
      const stem = pathStem(o.sourceName) || 'score';
      try {
        let exportXml = o.transposeSemitones !== 0 ? OMR.midi.transposeMusicXml(xml, o.transposeSemitones) : xml;
        exportXml = setPartInstrument(exportXml, o.program, o.instrumentName);
        r.musicxml = exportXml;
        r.mxl = await OMR.mxl.write(exportXml, stem + '.musicxml');
      } catch (exc) {
        r.warnings.push('MusicXML export: ' + excName(exc) + ': ' + excText(exc));
        if (!r.musicxml) r.musicxml = xml;
      }
      try {
        const conv = OMR.midi.convert(xml, {
          tempo: o.tempoBpm, program: o.program, transpose: o.transposeSemitones, title: r.title, instrumentName: o.instrumentName
        });
        r.midi = conv.midi;
        r.repeatsExpanded = conv.repeatsExpanded;
        for (const w of conv.warnings) r.warnings.push(friendlyWarning(w));
        r.totalMeasures = conv.summary.measures;
        r.totalNotes = conv.summary.notes;
        r.totalChords = conv.summary.chords;
        r.durationSeconds = conv.summary.durationSeconds;
        r.noteEvents = conv.summary.noteEvents;
        r.success = true;
      } catch (exc) {
        r.errorMessage = excName(exc) + ': ' + excText(exc);
      }
      return this.done();
    }
    cancelled() {
      this.finished = true;
      this.result.success = false;
      this.result.cancelled = true;
      this.result.errorMessage = 'Cancelled.';
      return this.done();
    }
    done() {
      this.result.timings.total = Math.round(nowMs() - (this.t0 || nowMs()));
      return this.result;
    }
  }

  // translate_file on decoded pages: pages = [{label?, image (BGR OMR.np image)}] in file order
  // (a PDF's pages rendered at 300 dpi; an image file is one page). -> Promise<result>
  async function translate(pages, options, hooks) {
    const t = new Translation(options, hooks);
    pages = pages || [];
    // total_pages = len(page_inputs): every page after maybe_split_landscape_spread
    t.totalPages = pages.reduce((s, p) => s + splitCount(p.image.w, p.image.h, t.options.splitWideSpreads), 0);
    t.start();
    try {
      for (let i = 0; i < pages.length; i++) {
        if (t.isCancelled()) return t.cancelled();
        await t.addPage(pages[i].image, pages[i].label || ('Page ' + (i + 1)), { totalPages: t.totalPages });
      }
      return await t.finish();
    } catch (exc) {
      if (isCancel(exc)) return t.cancelled();
      t.result.errorMessage = excName(exc) + ': ' + excText(exc);
      return t.done();
    }
  }

  OMR.engine = {
    translate, Translation, analyzePage, preprocessSheetImage, maybeSplitLandscapeSpread, splitCount,
    imageFromRgba, setPartInstrument, titleFromName, cleanTitle, skipReason, resizeCubicU8,
    get GM_INSTRUMENTS() { return gm(); }, GM_SOUNDS,
    // the pool
    localPool, segmentPooled, parseStaffsPooled, tasks: { segnet: taskSegnet, staff: taskStaff, encodeSymbols, decodeSymbols, release: releaseTasks },
    // Python helpers (tests)
    _pyTitle: pyTitle, _pyStrip: pyStrip, _pathStem: pathStem, _stripXmlForbidden: stripXmlForbidden, _medianU8: medianU8,
    _runLimited: runLimited
  };
})(typeof self !== 'undefined' ? self : globalThis);
