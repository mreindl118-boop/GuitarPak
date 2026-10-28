/* soundLAB OMR: port of homr/segmentation/inference_segnet.py and segmentation/config.py
   (AGPL-3.0, github.com/liebharc/homr).
   The segmentation net cuts the CLAHE page into 320 x 320 tiles, labels every pixel
   (0 background, 1 stems/rests, 2 noteheads, 3 clefs/keys, 4 staff, 5 other symbols) and the
   tiles are merged back into five 0/1 uint8 masks.

   Async boundary: everything that runs the ONNX session (Segnet.create, Segnet.run,
   inference, extract) returns a Promise; extractPatch / mergePatches are synchronous.
   The session comes from OMR.runtime.session (WASM; WebGPU only where the runtime picked
   it). Only the int8 model ships (no fp16 model): Python's GPU branches open the fp16 file,
   here the execution provider is the runtime's choice instead.

   BATCHES MATTER: the int8 net quantizes its activations with DynamicQuantizeLinear, whose
   scale and zero point come from the min/max of the WHOLE batch tensor. A tile's labels
   therefore depend on the other tiles of its batch; homr's default batch_size 8 (row-major
   tile order, a partial last batch) is what reproduces Python's masks bit for bit. */
(function (G) {
  'use strict';
  var OMR = G.OMR = G.OMR || {};
  var cv2 = OMR.cv2;
  var eprint = function () { OMR.simple_logging.eprint.apply(null, arguments); };
  var now = function () { return (G.performance && G.performance.now) ? G.performance.now() / 1000 : Date.now() / 1000; };
  // a Python exception: e.name = its class, e.message = Python's text
  function pyError(name, message) { var e = new Error(message); e.name = name; return e; }

  // homr: segmentation/config.py
  var modelName = 'segnet_308-3296ccd40960f90ca6ab9c035cca945675d30a0f';
  var segnetPathOnnx = modelName + '.onnx';
  var segnetPathOnnxFp16 = modelName + '_fp16.onnx';
  var segnetVersion = segnetPathOnnx.split('_')[1];
  var config = {
    modelName: modelName, segnetPathOnnx: segnetPathOnnx, segnetPathOnnxFp16: segnetPathOnnxFp16,
    segnetVersion: segnetVersion, segmentationVersion: segnetVersion
  };

  // homr: segmentation/inference_segnet.py:27
  // new Segnet(...) only stores what Segnet.create() opened: Python's __init__ opens the
  // session, which is asynchronous here. OMR.runtime owns the session (one per worker);
  // run() asks it again each time (a cached lookup), so a worker that frees it between pages
  // with OMR.runtime.release() gets a fresh one instead of a dead handle.
  class Segnet {
    constructor(useGpuInference, model, ort) {
      this.model = model;
      this.ort = ort;
      this.fp16 = false; // only the int8 model is shipped: float32 input
      var info = OMR.runtime && OMR.runtime.info ? OMR.runtime.info().sessions.segnet : null;
      this.useGpu = !!(info && info.ep === 'webgpu');
      this.sessionOpts = { ep: useGpuInference ? undefined : 'wasm' };
      this.inputName = model.inputNames[0];   // size: [batch_size, 3, 320, 320]
      this.outputName = model.outputNames[0];
    }
    // -> Promise<Segnet>. useGpuInference false keeps the session on WASM; true lets the
    // runtime's configured execution provider decide (configure({ep})).
    // opts: {onProgress, onRuntimeProgress} for the first download of the model / runtime
    static async create(useGpuInference, opts) {
      opts = opts || {};
      var ort = await OMR.runtime.loadOrt(opts.onRuntimeProgress);
      var model = await OMR.runtime.session(segnetPathOnnx, {
        ep: useGpuInference ? undefined : 'wasm', onProgress: opts.onProgress, onRuntimeProgress: opts.onRuntimeProgress
      });
      return new Segnet(useGpuInference, model, ort);
    }
    // homr: segmentation/inference_segnet.py:90
    // inputData: {data: Float32Array, dims: [n, 3, win, win]} -> {data: Float32Array, dims: [n, 6, win, win]}
    async run(inputData) {
      this.model = await OMR.runtime.session(segnetPathOnnx, this.sessionOpts);
      var feeds = {};
      feeds[this.inputName] = new this.ort.Tensor('float32', inputData.data, inputData.dims);
      var outs = await this.model.run(feeds);
      var out = outs[this.outputName];
      return { data: out.data, dims: out.dims.slice() };
    }
  }

  // homr: segmentation/inference_segnet.py:102
  class ExtractResult {
    constructor(filename, original, staff, symbols, stemsRests, notehead, clefsKeys) {
      this.filename = filename;
      this.original = original;
      this.staff = staff;
      this.symbols = symbols;
      this.stemsRests = stemsRests;
      this.notehead = notehead;
      this.clefsKeys = clefsKeys;
    }
  }

  var _segnetInference = null; // Promise<Segnet>, one per worker like Python's module global

  // homr: segmentation/inference_segnet.py:125
  /**
   * Returns a full-size (3, win_size, win_size) patch.
   * Pads with white pixes if the patch exceeds image boundaries.
   *
   * Python passes the page transposed to (3, h, w) float32 (57 MB for a page); here image is
   * the (h, w, 3) uint8 page and the transposition happens per patch: the same float32
   * values. out/offset: write the CHW patch into a batch buffer instead of a new array.
   * -> {c, h: winSize, w: winSize, data: Float32Array} in CHW order.
   */
  function extractPatch(image, y, x, winSize, out, offset) {
    var c = image.c, h = image.h, w = image.w, plane = winSize * winSize;
    offset = offset || 0;
    var patch = out || new Float32Array(c * plane);
    patch.fill(255, offset, offset + c * plane);

    var y0 = Math.max(y, 0);
    var x0 = Math.max(x, 0);
    var y1 = Math.min(y + winSize, h);
    var x1 = Math.min(x + winSize, w);

    var py0 = 0;
    var px0 = 0;
    var py1 = py0 + (y1 - y0);
    var px1 = px0 + (x1 - x0);

    // patch[:, py0:py1, px0:px1] = image[:, y0:y1, x0:x1]
    var d = image.data;
    for (var ch = 0; ch < c; ch++) {
      for (var py = py0; py < py1; py++) {
        var src = ((y0 + py - py0) * w + x0) * c + ch, dst = offset + ch * plane + py * winSize;
        for (var px = px0; px < px1; px++, src += c) patch[dst + px] = d[src];
      }
    }
    return out ? patch : { c: c, h: winSize, w: winSize, data: patch };
  }

  // homr: segmentation/inference_segnet.py:147
  // patches: per tile the (win, win) class map (np.argmax(out, axis=0): Uint8Array here, numpy
  // gives int64; the values 0..5 are the same). imageShape: [h, w].
  // -> {h, w, c: 1, data} of the patches' type: overlapping tiles are averaged in float32 and
  // truncated back to a class like Python's astype.
  function mergePatches(patches, imageShape, winSize, stepSize) {
    var H = imageShape[0], W = imageShape[1];
    var reconstructed = new Float32Array(H * W);
    var weight = new Float32Array(H * W);

    var idx = 0, iy, ix, yy, xx;
    for (iy = 0; iy < H; iy += stepSize) {
      var y = Math.min(iy, H - winSize);
      var y0 = Math.max(y, 0);
      var y1 = Math.min(y + winSize, H);

      for (ix = 0; ix < W; ix += stepSize) {
        var x = Math.min(ix, W - winSize);
        var x0 = Math.max(x, 0);
        var x1 = Math.min(x + winSize, W);

        var patch = patches[idx];
        var ph = y1 - y0;
        var pw = x1 - x0;

        // reconstructed[y0:y1, x0:x1] += patch[:ph, :pw]; weight[y0:y1, x0:x1] += 1
        for (yy = 0; yy < ph; yy++) {
          var r = (y0 + yy) * W + x0, p = yy * winSize;
          for (xx = 0; xx < pw; xx++) { reconstructed[r + xx] += patch[p + xx]; weight[r + xx] += 1; }
        }
        idx += 1;
      }
    }

    // Avoid division by zero
    var n = H * W, out = new patches[0].constructor(n);
    for (var i = 0; i < n; i++) {
      if (weight[i] === 0) weight[i] = 1;
      reconstructed[i] /= weight[i]; // float32 division (stored rounded, like numpy's in-place /=)
      out[i] = Math.trunc(reconstructed[i]);
    }
    return { h: H, w: W, c: 1, data: out };
  }

  // np.argmax(out, axis=0) for tile b of a [n, k, win, win] output: the first maximum wins
  // (and the first NaN, like numpy)
  function argmaxTile(out, b, k, plane) {
    var res = new Uint8Array(plane), base = b * k * plane;
    for (var p = 0; p < plane; p++) {
      var best = 0, bv = out[base + p];
      if (bv === bv) {
        for (var ch = 1; ch < k; ch++) {
          var v = out[base + ch * plane + p];
          if (v !== v) { best = ch; break; }
          if (v > bv) { best = ch; bv = v; }
        }
      }
      res[p] = best;
    }
    return res;
  }

  function checkAbort(signal) {
    if (signal && signal.aborted) {
      var e = signal.reason instanceof Error ? signal.reason : new Error('segmentation cancelled');
      if (!(signal.reason instanceof Error)) e.name = 'AbortError';
      throw e;
    }
  }

  // homr: segmentation/inference_segnet.py:179
  /**
   * Inference function for the segementation model.
   * Args:
   *     image_org(NDArray): Array of the input image
   *     batch_size(int): Mainly for speeding up GPU performance. Minimal impact on CPU speed.
   *     step_size(int): How far the window moves between to input images.
   *     win_size(int): Debug only.
   *
   * Returns:
   *     ExtractResult class.
   *
   * imageOrg: the gray uint8 page. opts (Python passes keywords): {useGpuInference, batchSize,
   * stepSize, winSize} plus the browser's onProgress(tilesDone, tilesTotal) after every
   * batch, signal (AbortSignal, checked between batches) and onModelProgress (first download).
   * -> Promise<[staff, symbols, stemsRests, notehead, clefsKeys]> (0/1 uint8 images)
   */
  async function inference(imageOrg, opts) {
    var useGpuInference = opts.useGpuInference, batchSize = opts.batchSize, stepSize = opts.stepSize, winSize = opts.winSize;
    eprint('Starting Inference.');
    var t0 = now();
    if (stepSize < 0) stepSize = Math.floor(winSize / 2);

    if (_segnetInference === null) {
      _segnetInference = Segnet.create(useGpuInference, { onProgress: opts.onModelProgress });
      _segnetInference.catch(function () { _segnetInference = null; });
    }
    var segnet = await _segnetInference;

    imageOrg = cv2.cvtColor(imageOrg, cv2.COLOR_GRAY2BGR);
    var c = imageOrg.c, h = imageOrg.h, w = imageOrg.w;
    var data = [];

    // the tile positions in Python's loop order (the total feeds onProgress); a zero step raises
    // where Python's range() does: after the Segnet was made and cvtColor checked the page
    if (stepSize === 0) throw pyError('ValueError', 'range() arg 3 must not be zero');
    var tiles = [], yLoop, xLoop;
    for (yLoop = 0; yLoop < Math.max(h, winSize); yLoop += stepSize) {
      var y = Math.min(yLoop, h - winSize);
      for (xLoop = 0; xLoop < Math.max(w, winSize); xLoop += stepSize) {
        tiles.push([y, Math.min(xLoop, w - winSize)]);
      }
    }
    var total = tiles.length, plane = winSize * winSize, tileSize = c * plane;
    // (a batch_size < 1 never fills, so Python runs every tile in the final batch)
    var buf = new Float32Array((batchSize >= 1 ? Math.min(batchSize, total) : total) * tileSize), inBatch = 0;
    if (opts.onProgress) opts.onProgress(0, total);

    async function runBatch() {
      checkAbort(opts.signal);
      var input = inBatch * tileSize === buf.length ? buf : buf.subarray(0, inBatch * tileSize);
      var batchOut = await segnet.run({ data: input, dims: [inBatch, c, winSize, winSize] });
      var k = batchOut.dims[1];
      for (var b = 0; b < inBatch; b++) data.push(argmaxTile(batchOut.data, b, k, plane));
      inBatch = 0;
      if (opts.onProgress) opts.onProgress(data.length, total);
    }

    for (var t = 0; t < total; t++) {
      extractPatch(imageOrg, tiles[t][0], tiles[t][1], winSize, buf, inBatch * tileSize);
      inBatch += 1;
      if (inBatch === batchSize) await runBatch();
    }
    if (inBatch) await runBatch();

    eprint('Segnet Inference time: ' + (now() - t0) + '; batch_size ' + batchSize);

    var merged = mergePatches(data, [imageOrg.h, imageOrg.w], winSize, stepSize);

    function cls(k) {
      var m = new Uint8Array(merged.data.length), md = merged.data;
      for (var i = 0; i < md.length; i++) m[i] = md[i] === k ? 1 : 0;
      return { h: merged.h, w: merged.w, c: 1, data: m };
    }
    var stemsRests = cls(1);
    var notehead = cls(2);
    var clefsKeys = cls(3);
    var staff = cls(4);
    var symbols = cls(5);

    return [staff, symbols, stemsRests, notehead, clefsKeys];
  }

  // homr: segmentation/inference_segnet.py:244
  // extract(original_image, img_path_str, use_cache=False, use_gpu_inference=True,
  //         batch_size=8, step_size=-1, win_size=320) -> Promise<ExtractResult>
  // opts: those keywords camelCased + onProgress / signal / onModelProgress (see inference).
  // There is no disk in the browser: use_cache's .npy cache next to the image is not ported,
  // useCache is accepted and ignored.
  async function extract(originalImage, imgPathStr, opts) {
    opts = opts || {};
    var o = {
      useGpuInference: opts.useGpuInference === undefined ? true : opts.useGpuInference,
      batchSize: opts.batchSize === undefined ? 8 : opts.batchSize,
      stepSize: opts.stepSize === undefined ? -1 : opts.stepSize,
      winSize: opts.winSize === undefined ? 320 : opts.winSize,
      onProgress: opts.onProgress, signal: opts.signal, onModelProgress: opts.onModelProgress
    };
    var r = await inference(originalImage, o);
    var staff = r[0], symbols = r[1], stemsRests = r[2], notehead = r[3], clefsKeys = r[4];

    originalImage = cv2.resize(originalImage, [staff.w, staff.h]);

    return new ExtractResult(imgPathStr, originalImage, staff, symbols, stemsRests, notehead, clefsKeys);
  }

  // drop the kept Segnet (the runtime keeps the session itself; OMR.runtime.release frees it)
  function _reset() { _segnetInference = null; }
  // tests: use a stand-in with run({data, dims}) -> Promise<{data, dims}> (Python's tests
  // assign the module global the same way)
  function _inject(segnet) { _segnetInference = Promise.resolve(segnet); }

  OMR.segmentation_config = config;
  OMR.inference_segnet = {
    Segnet: Segnet, ExtractResult: ExtractResult, extractPatch: extractPatch, mergePatches: mergePatches,
    inference: inference, extract: extract, config: config, _argmaxTile: argmaxTile, _reset: _reset, _inject: _inject
  };
})(typeof self !== 'undefined' ? self : globalThis);
