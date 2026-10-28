/* soundLAB OMR: port of homr/transformer/encoder_inference.py (AGPL-3.0, github.com/liebharc/homr).
   The TrOMR image encoder: a staff image (1 x 1 x 256 x 1280, normalised) -> the context the
   decoder attends to (1 x 1280 x 512).

   Async boundary: Encoder.create and encoder.generate return Promises (ONNX session).
   Python picks the model FILE here (the fp16 encoder with a GPU or CoreML, else encoder_path);
   in the browser OMR.runtime owns the model and the execution provider. Only the int8 encoder
   ships (float32 input/output, so fp16 stays false). Use ep 'wasm': the int8 encoder's numerics
   on WebGPU differ from the CPU (DynamicQuantizeLinear flips quantisation steps), and even
   onnxruntime-web WASM is not bit-identical to Python's CPU kernels (see notes/read.md). */
(function (G) {
  'use strict';
  var OMR = G.OMR = G.OMR || {};

  // homr: transformer/encoder_inference.py:14
  class Encoder {
    // Python's __init__ opens the session, which is asynchronous here: use Encoder.create().
    // session: an onnxruntime-web InferenceSession, ort: the onnxruntime module (for Tensor).
    // opts.sessionOpts: what to pass to OMR.runtime.session on every run (null = keep `session`,
    // e.g. a session the caller made from other model bytes).
    constructor(config, session, ort, opts) {
      opts = opts || {};
      this.config = config;
      this.encoder = session;
      this.ort = ort;
      this.useGpu = false;
      this.fp16 = false; // the shipped encoder is int8 with float32 input / output
      this.sessionOpts = opts.sessionOpts === undefined ? null : opts.sessionOpts;
      this.deviceId = 0;
      this.inputName = session.inputNames[0];
      this.outputName = session.outputNames[0];
    }
    // -> Promise<Encoder>. opts: {session (use this InferenceSession instead of the runtime's
    // 'encoder'), ep ('wasm' | 'webgpu' | undefined = the runtime's choice), onProgress,
    // onRuntimeProgress}
    static async create(config, opts) {
      opts = opts || {};
      const ort = opts.ort || await OMR.runtime.loadOrt(opts.onRuntimeProgress);
      if (opts.session) return new Encoder(config, opts.session, ort, { sessionOpts: null });
      const sessionOpts = { ep: opts.ep, onProgress: opts.onProgress, onRuntimeProgress: opts.onRuntimeProgress };
      const session = await OMR.runtime.session('encoder', sessionOpts);
      return new Encoder(config, session, ort, { sessionOpts: { ep: opts.ep } });
    }
    // homr: transformer/encoder_inference.py:74
    // x: {data: Float32Array, dims: [1, 1, 256, 1280]} -> Promise<{data: Float32Array, dims: [1, 1280, 512]}>
    async generate(x) {
      // the runtime keeps one session per worker; asking again lets a worker that released it
      // between pages get a fresh one instead of a dead handle
      if (this.sessionOpts) this.encoder = await OMR.runtime.session('encoder', this.sessionOpts);
      const feeds = {};
      const data = x.data instanceof Float32Array ? x.data : Float32Array.from(x.data);
      feeds[this.inputName] = new this.ort.Tensor('float32', data, x.dims.slice());
      const outs = await this.encoder.run(feeds);
      const out = outs[this.outputName];
      return { data: out.data, dims: out.dims.slice() };
    }
  }

  OMR.transformer_encoder_inference = { Encoder: Encoder };
})(typeof self !== 'undefined' ? self : globalThis);
