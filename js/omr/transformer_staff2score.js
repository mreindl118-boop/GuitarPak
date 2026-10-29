/* soundLAB OMR: port of homr/transformer/staff2score.py (AGPL-3.0, github.com/liebharc/homr).
   Inference class for TrOMR: a 256 x 1280 staff image -> EncodedSymbols.

   Async boundary: Staff2Score.create and staff2score.predict return Promises (encoder + decoder
   sessions); ConvertToArray (_transform) is synchronous. */
(function (G) {
  'use strict';
  var OMR = G.OMR = G.OMR || {};
  const Encoder = OMR.transformer_encoder_inference.Encoder;
  const getDecoder = OMR.transformer_decoder_inference.getDecoder;

  function eprint() {
    const sl = OMR.simple_logging;
    if (sl && sl.eprint) sl.eprint.apply(null, arguments);
  }
  const perfCounter = () => (G.performance && G.performance.now ? G.performance.now() / 1000 : Date.now() / 1000);

  // homr: transformer/staff2score.py:15
  // Inference class for Tromr. Use predict() for prediction
  class Staff2Score {
    // Python's __init__ opens both sessions (asynchronous here): use Staff2Score.create().
    constructor(config, encoder, decoder) {
      this.config = config;
      this.encoder = encoder;
      this.decoder = decoder;
      // homr checks here that tokenizer_rhythm.json exists; the tokenizer files are not read at
      // inference (the decoder detokenizes with the Vocabulary) and are not shipped.
    }
    // -> Promise<Staff2Score>. opts: {encoder: Encoder.create options (e.g. {session} for another
    // encoder model), decoder: getDecoder options, onProgress, onRuntimeProgress}
    static async create(config, opts) {
      opts = opts || {};
      const common = { onProgress: opts.onProgress, onRuntimeProgress: opts.onRuntimeProgress };
      const encoder = await Encoder.create(config, Object.assign({}, common, opts.encoder || {}));
      const decoder = await getDecoder(config, Object.assign({}, common, opts.decoder || {}));
      return new Staff2Score(config, encoder, decoder);
    }

    // homr: transformer/staff2score.py:30
    // Inference an image (an OMR.np gray image, 256 x 1280 uint8) using Tromr. -> Promise<EncodedSymbol[]>
    async predict(image) {
      const x = _transform.transform(image);

      const t0 = perfCounter();

      // Create special tokens
      const startToken = [[1]];
      const nonoteToken = [[0]];

      // Generate context with encoder. The encoder and decoder may run in
      // different precisions (e.g. the CoreML encoder is fp16 while the
      // decoder stays on the fp32 CPU model), so cast the context to the
      // dtype the decoder expects before handing it over.
      // (Both run float32 here: the shipped models have float32 inputs and outputs.)
      const context = await this.encoder.generate(x);
      this.lastEncoderSecs = perfCounter() - t0;

      // Make a prediction using decoder
      const t1 = perfCounter();
      const out = await this.decoder.generate(startToken, nonoteToken, {
        seqLen: this.config.maxSeqLen,
        eosToken: this.config.eosToken,
        context: context
      });
      this.lastDecoderSecs = perfCounter() - t1;
      this.lastSteps = out.length + (out.length < this.config.maxSeqLen ? 1 : 0); // + the EOS step

      eprint('Inference Time Tromr: ' + (perfCounter() - t0));

      return out;
    }
  }

  // homr: transformer/staff2score.py:65
  // (img / 255 - mean) / std in float64, then .astype(float32), as numpy computes it. A float32
  // image is divided by 255 in float32 (NEP 50: the Python int stays weak) before the float64
  // mean / std; homr's canvas is uint8, so only direct callers see that path.
  class ConvertToArray {
    constructor() {
      this.mean = 0.7931;
      this.std = 0.1738;
      this._lut = null;
    }
    normalize(v) { return (v - this.mean) / this.std; }
    // image: {h, w, c, data} -> {data: Float32Array, dims: [1, 1, h, w] (+ [c] for a colour image)}
    transform(image) { // __call__
      if (!this._lut) { // every uint8 value's result (the same float64 ops, then float32)
        this._lut = new Float32Array(256);
        for (let v = 0; v < 256; v++) this._lut[v] = this.normalize(v / 255);
      }
      const d = image.data, out = new Float32Array(d.length);
      if (d instanceof Uint8Array || d instanceof Uint8ClampedArray) {
        for (let i = 0; i < d.length; i++) out[i] = this._lut[d[i]];
      } else if (d instanceof Float32Array) {
        for (let i = 0; i < d.length; i++) out[i] = this.normalize(Math.fround(d[i] / 255));
      } else {
        for (let i = 0; i < d.length; i++) out[i] = this.normalize(d[i] / 255);
      }
      const dims = [1, 1, image.h, image.w];
      if (image.c > 1) dims.push(image.c);
      return { data: out, dims: dims };
    }
  }

  const _transform = new ConvertToArray();

  OMR.transformer_staff2score = { Staff2Score: Staff2Score, ConvertToArray: ConvertToArray, _transform: _transform };
})(typeof self !== 'undefined' ? self : globalThis);
