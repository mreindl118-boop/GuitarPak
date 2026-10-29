/* soundLAB OMR: port of homr/transformer/decoder_inference.py (AGPL-3.0, github.com/liebharc/homr).
   The TrOMR decoder: greedy decoding with a key/value cache. Every step feeds the last token of
   each branch (rhythm, pitch, lift, articulation, slur), the encoder context (the full
   1 x 1280 x 512 context on step 0, then only context[:, :1]), cache_len = step and the 32
   cache tensors of the previous step; the six heads' argmax make one EncodedSymbol, the
   attention output (2 floats) is its coordinates. Stops at EOS or after max_seq_len steps.

   Async boundary: getDecoder, ScoreDecoder.generate return Promises (ONNX session, always
   WASM: the int8 decoder uses MatMulInteger and com.microsoft contrib ops). Token arrays are
   Python's int64 numpy arrays as nested JS arrays of numbers ([[1]]), the context is
   {data: Float32Array, dims: [1, n, 512]}. */
(function (G) {
  'use strict';
  var OMR = G.OMR = G.OMR || {};
  const V = OMR.transformer_vocabulary;
  const np = OMR.np;

  function pyError(name, message) { const e = new Error(message); e.name = name; e.pyType = name; return e; }
  function first(list) { // list[0] with Python's IndexError
    if (!list.length) throw pyError('IndexError', 'list index out of range');
    return list[0];
  }
  // {v: k for k, v in vocab.items()} with Python's KeyError on a missing id
  function inverse(vocab) {
    const arr = V.invert(vocab);
    return { get: (k) => { if (!(k in arr)) throw pyError('KeyError', String(k)); return arr[k]; } };
  }

  // homr: transformer/decoder_inference.py:13
  class ScoreDecoder {
    // transformer: the decoder InferenceSession; ort: the onnxruntime module (Tensor);
    // opts.sessionOpts: what to ask OMR.runtime.session for on every generate (null = keep it)
    constructor(transformer, fp16, useGpu, config, ignoreIndex, ort, opts) {
      opts = opts || {};
      this.ignoreIndex = ignoreIndex === undefined || ignoreIndex === null ? -100 : ignoreIndex;
      this.config = config;
      this.net = transformer;
      this.ort = ort;
      this.sessionOpts = opts.sessionOpts === undefined ? null : opts.sessionOpts;
      this.maxSeqLen = config.maxSeqLen;
      this.eosToken = config.eosToken;

      this.invRhythmVocab = inverse(config.rhythmVocab);
      this.invPitchVocab = inverse(config.pitchVocab);
      this.invLiftVocab = inverse(config.liftVocab);
      this.invArticulationVocab = inverse(config.articulationVocab);
      this.invSlurVocab = inverse(config.slurVocab);
      this.invPositionVocab = inverse(config.positionVocab);

      this.fp16 = fp16;
      this.useGpu = useGpu;
      this.device = useGpu ? 'cuda' : 'cpu';
      this.deviceId = 0;
      this.outputNames = [
        'out_rhythms',
        'out_pitchs',
        'out_lifts',
        'out_positions',
        'out_articulations',
        'out_slurs',
        'attention'
      ];
    }

    // homr: transformer/decoder_inference.py:51
    // startTokens / nonoteTokens: [[id]] (or [id], 1-D like Python's num_dims == 1);
    // kwargs.context: {data: Float32Array, dims: [1, n, 512]}. -> Promise<EncodedSymbol[]>
    async generate(startTokens, nonoteTokens, kwargs) {
      kwargs = kwargs || {};
      if (this.sessionOpts) this.net = await OMR.runtime.session('decoder', this.sessionOpts);
      const ort = this.ort;
      const numDims = Array.isArray(startTokens[0]) ? 2 : 1;
      if (numDims === 1) startTokens = [startTokens];

      // only the last token of each branch is ever read back: keep the last ones
      let outRhythm = startTokens[0][startTokens[0].length - 1];
      const nonote = Array.isArray(nonoteTokens[0]) ? nonoteTokens[0][nonoteTokens[0].length - 1] : nonoteTokens[nonoteTokens.length - 1];
      let outPitch = nonote, outLift = nonote, outArticulations = nonote, outSlurs = nonote;
      const ic = this.initCache();
      let cache = ic[0];
      const kvInputNames = ic[1], kvOutputNames = ic[2];
      const ctx = kwargs.context;
      const contextFull = new ort.Tensor('float32', ctx.data, ctx.dims.slice());
      // context[:, :1]
      const rowLen = ctx.dims[2];
      const contextReduced = new ort.Tensor('float32', ctx.data.slice(0, rowLen), [ctx.dims[0], 1, rowLen]);
      const i64 = (v) => new ort.Tensor('int64', BigInt64Array.of(BigInt(v)), [1, 1]);

      const symbols = [];

      for (let step = 0; step < this.maxSeqLen; step++) {
        // after the first step we don't pass the full context into the decoder
        // x_transformers uses [:, :0] to split the context
        // which caused a Reshape error when loading the onnx model
        const context = step === 0 ? contextFull : contextReduced;

        // Bind Inputs
        const feeds = {
          rhythms: i64(outRhythm),
          pitchs: i64(outPitch),
          lifts: i64(outLift),
          articulations: i64(outArticulations),
          slurs: i64(outSlurs),
          context: context,
          cache_len: new ort.Tensor('int64', BigInt64Array.of(BigInt(step)), [1])
        };
        for (let k = 0; k < kvInputNames.length; k++) feeds[kvInputNames[k]] = cache[k];

        // Run inference
        const outputs = await this.net.run(feeds);
        cache = kvOutputNames.map((n) => outputs[n]);

        // Greedy decoding: pick the highest logit directly for each output
        const rhythmSample = lastArgmax(outputs.out_rhythms);
        const pitchSample = lastArgmax(outputs.out_pitchs);
        const liftSample = lastArgmax(outputs.out_lifts);
        const articulationSample = lastArgmax(outputs.out_articulations);
        const slurSample = lastArgmax(outputs.out_slurs);
        const positionSample = lastArgmax(outputs.out_positions);
        const attention = Float32Array.from(outputs.attention.data);

        // JS only: a per-step observer (tests, diagnostics): the six heads' argmax in symbol
        // order (rhythm, pitch, lift, articulation, slur, position), the attention and the raw
        // ORT outputs of the step
        if (kwargs.onStep) {
          kwargs.onStep({ step: step, arg: [rhythmSample, pitchSample, liftSample, articulationSample, slurSample, positionSample],
            att: attention, outputs: outputs });
        }

        const liftToken = detokenize([liftSample], this.invLiftVocab);
        const pitchToken = detokenize([pitchSample], this.invPitchVocab);
        const rhythmToken = detokenize([rhythmSample], this.invRhythmVocab);
        const articulationToken = detokenize([articulationSample], this.invArticulationVocab);
        const slurToken = detokenize([slurSample], this.invSlurVocab);
        const positionToken = detokenize([positionSample], this.invPositionVocab);

        if (rhythmSample === this.eosToken) break;

        const symbol = new V.EncodedSymbol(first(rhythmToken), first(pitchToken), first(liftToken),
          first(articulationToken), first(slurToken), first(positionToken), attention);
        symbols.push(symbol);

        outLift = liftSample;
        outPitch = pitchSample;
        outRhythm = rhythmSample;
        outArticulations = articulationSample;
        outSlurs = slurSample;
      }
      return symbols;
    }

    // homr: transformer/decoder_inference.py:155
    // -> [cache tensors (zeros [1, heads, cacheLen, dim / heads]), input names, output names]
    initCache(cacheLen) {
      cacheLen = cacheLen || 0;
      const cache = [], inputNames = [], outputNames = [];
      const heads = this.config.decoderHeads;
      const headDim = Math.floor(this.config.decoderDim / heads);
      for (let i = 0; i < this.config.decoderDepth * 4; i++) {
        // fp16 would need an fp16 cache; only the float32-IO int8 decoder ships
        cache.push(new this.ort.Tensor('float32', new Float32Array(heads * cacheLen * headDim), [1, heads, cacheLen, headDim]));
        inputNames.push('cache_in' + i);
        outputNames.push('cache_out' + i);
      }
      return [cache, inputNames, outputNames];
    }
  }

  // x[:, -1, :].argmax() of a [1, t, V] logits tensor (the first maximum; a NaN wins like numpy)
  function lastArgmax(t) {
    const v = t.dims[t.dims.length - 1], n = t.data.length;
    return np.argmax(t.data.subarray(n - v, n));
  }

  // homr: transformer/decoder_inference.py:183
  function detokenize(tokens, vocab) {
    let toks = tokens.map((tok) => vocab.get(tok));
    toks = toks.filter((t) => t !== '[BOS]' && t !== '[EOS]' && t !== '[PAD]');
    return toks;
  }

  // homr: transformer/decoder_inference.py:189
  // Returns Tromr's Decoder -> Promise<ScoreDecoder>. Python opens the fp16 decoder with a GPU
  // and decoder_path otherwise; here OMR.runtime's 'decoder' (the int8 one, always WASM).
  // opts: {session (use this InferenceSession), onProgress, onRuntimeProgress}
  async function getDecoder(config, opts) {
    opts = opts || {};
    const ort = opts.ort || await OMR.runtime.loadOrt(opts.onRuntimeProgress);
    if (opts.session) return new ScoreDecoder(opts.session, false, false, config, -100, ort, { sessionOpts: null });
    const sessionOpts = { ep: 'wasm', onProgress: opts.onProgress, onRuntimeProgress: opts.onRuntimeProgress };
    const session = await OMR.runtime.session('decoder', sessionOpts);
    return new ScoreDecoder(session, false, false, config, -100, ort, { sessionOpts: { ep: 'wasm' } });
  }

  OMR.transformer_decoder_inference = { ScoreDecoder: ScoreDecoder, detokenize: detokenize, getDecoder: getDecoder, _lastArgmax: lastArgmax };
})(typeof self !== 'undefined' ? self : globalThis);
