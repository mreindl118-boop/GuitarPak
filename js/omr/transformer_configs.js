/* soundLAB OMR: port of homr/transformer/configs.py (AGPL-3.0, github.com/liebharc/homr).
   The TrOMR transformer's configuration. FilePaths holds model FILE NAMES only: runtime.js maps
   a name to the model's bytes (fetched, verified, cached). The tokenizer_*.json files are not
   read at inference: Staff2Score only checks that tokenizer_rhythm.json exists, and the decoder
   detokenizes with the Vocabulary dicts below (the JSON files hold an older, different vocabulary). */
(function (G) {
  'use strict';
  var OMR = G.OMR = G.OMR || {};
  const Vocabulary = OMR.transformer_vocabulary.Vocabulary;

  const modelName = 'pytorch_model_509-2293bba14bfea47d9d28411339362af15fce4c31';

  class FilePaths {
    // homr: transformer/configs.py:11
    constructor() {
      this.encoderPath = 'encoder_' + modelName + '.onnx';
      this.decoderPath = 'decoder_' + modelName + '.onnx';

      this.encoderPathFp16 = 'encoder_' + modelName + '_fp16.onnx';
      this.decoderPathFp16 = 'decoder_' + modelName + '_fp16.onnx';

      // training only (root_dir/training/architecture/transformer/<name>.pth in homr)
      this.checkpoint = modelName + '.pth';

      this.rhythmtokenizer = 'tokenizer_rhythm.json';
      this.lifttokenizer = 'tokenizer_lift.json';
      this.pitchtokenizer = 'tokenizer_pitch.json';
      this.notetokenizer = 'tokenizer_note.json';
    }

    toDict() {
      return {
        checkpoint: this.checkpoint,
        rhythmtokenizer: this.rhythmtokenizer,
        lifttokenizer: this.lifttokenizer,
        pitchtokenizer: this.pitchtokenizer,
        notetokenizer: this.notetokenizer
      };
    }

    // json.dumps(d, indent=2) and JSON.stringify(d, null, 2) agree for these plain values
    toJsonString() { return JSON.stringify(this.toDict(), null, 2); }
  }

  class DecoderArgs {
    // homr: transformer/configs.py:58
    constructor() {
      this.attnOnAttn = true;
      this.crossAttend = true;
      this.ffGlu = true;
      this.relPosBias = false;
      this.useScalenorm = false;
      this.attnDropout = 0.1;
      this.ffDropout = 0.1;
      this.layerDropout = 0.1;
    }

    toDict() {  // snake_case keys like homr's dict
      return {
        attn_on_attn: this.attnOnAttn,
        cross_attend: this.crossAttend,
        ff_glu: this.ffGlu,
        rel_pos_bias: this.relPosBias,
        use_scalenorm: this.useScalenorm,
        attn_dropout: this.attnDropout,
        ff_dropout: this.ffDropout,
        layer_dropout: this.layerDropout
      };
    }

    toJsonString() { return JSON.stringify(this.toDict(), null, 2); }
  }

  class Config {
    // homr: transformer/configs.py:85
    constructor() {
      this.vocab = new Vocabulary();
      this.filepaths = new FilePaths();
      this.channels = 1;
      this.patchSize = 16;
      this.maxHeight = 256;
      this.maxWidth = 1280;
      this.maxSeqLen = 608;
      this.padToken = 0;
      this.bosToken = 1;
      this.eosToken = 2;
      this.nonoteToken = 0;
      this.numRhythmTokens = Object.keys(this.vocab.rhythm).length;
      this.numPitchTokens = Object.keys(this.vocab.pitch).length;
      this.numLiftTokens = Object.keys(this.vocab.lift).length;
      this.numArticulationTokens = Object.keys(this.vocab.articulation).length;
      this.numSlurTokens = Object.keys(this.vocab.slur).length;
      this.numPositionTokens = Object.keys(this.vocab.position).length;
      this.encoderStructure = 'convnext';
      this.encoderDepth = 8;
      this.backboneLayers = [3, 4, 6, 3];
      this.encoderDim = 512;
      // encoder_h_dim balances how many dimensions the
      // horizontal vs vertical embeddings get
      this.encoderHDim = Math.floor(this.encoderDim / 3);
      this.encoderHeads = 8;
      this.decoderDim = this.encoderDim;
      this.decoderDepth = 8;
      this.decoderHeads = 8;
      this.decoderArgs = new DecoderArgs();
      this.liftVocab = this.vocab.lift;
      this.pitchVocab = this.vocab.pitch;
      this.rhythmVocab = this.vocab.rhythm;
      this.articulationVocab = this.vocab.articulation;
      this.slurVocab = this.vocab.slur;
      this.positionVocab = this.vocab.position;
      // In homr True selects the *_fp16.onnx models (with a GPU, or as the fallback when the GPU
      // providers are missing); homr's main.py and SheetLab set it from transformer_use_gpu, which
      // is False on a CPU, so they run encoderPath/decoderPath. Which models the browser runs is
      // runtime.js' choice.
      this.useGpuInference = true;
      // Opt-in: run the encoder on the Apple GPU via CoreML (MLProgram). Off
      // by default because compiling the MLProgram costs 26-60 s at session
      // creation, so it only pays off across many images. Set via the
      // --coreml-encoder CLI flag.
      this.useCoremlEncoder = false;

      // Scheduled Sampling parameters
      this.scheduledSamplingStartProb = 1.0;
      this.scheduledSamplingEndProb = 0.4;
      this.scheduledSamplingDecaySteps = 45000;
    }

    toDict() {  // snake_case keys like homr's dict
      return {
        filepaths: this.filepaths.toDict(),
        channels: this.channels,
        patch_size: this.patchSize,
        max_height: this.maxHeight,
        max_width: this.maxWidth,
        max_seq_len: this.maxSeqLen,
        pad_token: this.padToken,
        bos_token: this.bosToken,
        eos_token: this.eosToken,
        nonote_token: this.nonoteToken,
        encoder_structure: this.encoderStructure,
        encoder_depth: this.encoderDepth,
        backbone_layers: this.backboneLayers,
        encoder_dim: this.encoderDim,
        encoder_heads: this.encoderHeads,
        num_rhythm_tokens: this.numRhythmTokens,
        decoder_dim: this.decoderDim,
        decoder_depth: this.decoderDepth,
        decoder_heads: this.decoderHeads,
        decoder_args: this.decoderArgs.toDict()
      };
    }

    toJsonString() { return JSON.stringify(this.toDict(), null, 2); }
  }

  // Initialize the Config class
  const defaultConfig = new Config();

  OMR.transformer_configs = {
    modelName: modelName, FilePaths: FilePaths, DecoderArgs: DecoderArgs, Config: Config, defaultConfig: defaultConfig
  };
})(typeof self !== 'undefined' ? self : globalThis);
