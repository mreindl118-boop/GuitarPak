/* soundLAB OMR: the engine's script list in load order (Python import order of
   homr, github.com/liebharc/homr, AGPL-3.0). The worker importScripts() these,
   the Node parity suites require() them and sw.js precaches them. A module only
   uses what an earlier file exports. */
(function (G) {
  'use strict';
  var OMR = G.OMR = G.OMR || {};
  OMR.FILES = [
    // foundation: Python/numpy semantics, OpenCV + Pillow equivalents, geometry, data model
    'np.js', 'cv.js', 'pil.js', 'simple_logging.js', 'constants.js', 'image_utils.js', 'point_mapping.js',
    'find_peaks.js', 'bounding_boxes.js', 'debug.js', 'model.js',
    // the symbol language: tokens, keys, triplets, MusicXML
    'transformer_vocabulary.js', 'transformer_configs.js', 'circle_of_fifths.js', 'triplet_restoration.js',
    'music_xml_generator.js',
    // page -> segmentation masks
    'autocrop.js', 'resize.js', 'color_adjust.js', 'inference_segnet.js', 'noise_filtering.js',
    // masks -> staffs, notes, systems
    'bar_line_detection.js', 'staff_detection.js', 'note_detection.js', 'brace_dot_detection.js',
    'system_repair.js', 'staff_regions.js',
    // staffs -> tokens (TrOMR)
    'staff_dewarping.js', 'transformer_encoder_inference.js', 'transformer_decoder_inference.js',
    'transformer_staff2score.js', 'staff_parsing_tromr.js', 'staff_parsing.js',
    // the owner's SheetLab engine around it: runtime, MIDI, MXL, page loop
    'runtime.js', 'midi.js', 'mxl.js', 'engine.js'
  ];
})(typeof self !== 'undefined' ? self : globalThis);
