/* soundLAB OMR: port of homr/transformer/encoder_inference.py (AGPL-3.0, github.com/liebharc/homr).
   The TrOMR image encoder: a staff image (1 x 1 x 256 x 1280, normalised) -> the context the
   decoder attends to (1 x 1280 x 512).

   Async boundary: Encoder.create and encoder.generate return Promises (ONNX session).
   Python picks the model FILE here (the fp16 encoder with a GPU or CoreML, else encoder_path);
   in the browser OMR.runtime owns the model and the execution provider. Only the int8 encoder
   ships (float32 input/output, so fp16 stays false). Execution provider: 'wasm' unless a caller
   asks otherwise. The int8 encoder's numerics on WebGPU differ from the CPU (its heavy ops have no
   WebGPU kernels and DynamicQuantizeLinear flips quantisation steps on the GPU's floats), so the
   tokens would drift from homr's; even onnxruntime-web WASM is not bit-identical to Python's CPU
   kernels (the context differs by up to ~0.2; tokens agree, see notes/read.md). NOTE: OMR.runtime
   keeps ONE session per model whatever ep it was made with, so configure the runtime with
   {ep: 'wasm'} before runtime.prepare() / the first session. */
(function (G) {
  'use strict';
  var OMR = G.OMR = G.OMR || {};

  function eprint() {
    const sl = OMR.simple_logging;
    if (sl && sl.eprint) sl.eprint.apply(null, arguments);
  }

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
    // 'encoder'), ep ('wasm' default | 'webgpu' | 'auto' = the runtime's choice), ort (the
    // onnxruntime module when it is not loaded through OMR.runtime), onProgress, onRuntimeProgress}
    static async create(config, opts) {
      opts = opts || {};
      const ort = opts.ort || await OMR.runtime.loadOrt(opts.onRuntimeProgress);
      if (opts.session) return new Encoder(config, opts.session, ort, { sessionOpts: null });
      const ep = opts.ep === 'auto' ? undefined : (opts.ep || 'wasm');
      const sessionOpts = { ep: ep, onProgress: opts.onProgress, onRuntimeProgress: opts.onRuntimeProgress };
      const session = await OMR.runtime.session('encoder', sessionOpts);
      const info = OMR.runtime.info && OMR.runtime.info().sessions;
      if (ep === 'wasm' && info && info.encoder && info.encoder.ep !== 'wasm') {
        eprint('Encoder: the runtime\'s encoder session runs on ' + info.encoder.ep + ', its tokens may differ from homr\'s');
      }
      return new Encoder(config, session, ort, { sessionOpts: { ep: ep } });
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
