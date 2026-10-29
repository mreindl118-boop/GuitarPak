/* GuitarLab service worker — cache-first so the app works fully offline once visited. */
var CACHE = 'guitarlab-v132';
var ASSETS = [
  '.',
  'index.html',
  'css/style.css',
  'css/lumi-practice.css',
  'fonts/barlow-400.woff2',
  'fonts/barlow-500.woff2',
  'fonts/barlowcond-600.woff2',
  'fonts/barlowcond-700.woff2',
  'fonts/bebasneue-400.ttf',
  'fonts/slmusic.woff2',
  'js/theory.js',
  'js/app.js',
  'js/learn-instruments.js',
  'js/note-palette.js',
  'js/midi.js',
  'js/remote.js',
  'js/practice-router.js',
  'js/tonein.js',
  'js/audioin.js',
  'js/metronome.js',
  'js/fretboard.js',
  'js/chords.js',
  'js/piano.js',
  'js/keylessons.js',
  'js/lights.js',
  'js/songs.js',
  'js/sheetlab.js',
  // SheetLab's OMR engine (js/omr/manifest.js OMR.FILES + the worker); the models (models/omr/)
  // and the runtime (opencv.js / onnxruntime-web / pdf.js) are NOT precached: runtime.js and
  // sheetlab.js keep them in their own 'soundlab-omr-*' caches after the owner taps Download
  'js/omr/manifest.js',
  'js/omr/worker.js',
  'js/omr/np.js', 'js/omr/cv.js', 'js/omr/pil.js', 'js/omr/simple_logging.js',
  'js/omr/constants.js', 'js/omr/image_utils.js', 'js/omr/point_mapping.js', 'js/omr/find_peaks.js',
  'js/omr/bounding_boxes.js', 'js/omr/debug.js', 'js/omr/model.js', 'js/omr/transformer_vocabulary.js',
  'js/omr/transformer_configs.js', 'js/omr/circle_of_fifths.js', 'js/omr/triplet_restoration.js', 'js/omr/music_xml_generator.js',
  'js/omr/autocrop.js', 'js/omr/resize.js', 'js/omr/color_adjust.js', 'js/omr/inference_segnet.js',
  'js/omr/noise_filtering.js', 'js/omr/bar_line_detection.js', 'js/omr/staff_detection.js', 'js/omr/note_detection.js',
  'js/omr/brace_dot_detection.js', 'js/omr/system_repair.js', 'js/omr/staff_regions.js', 'js/omr/staff_dewarping.js',
  'js/omr/transformer_encoder_inference.js', 'js/omr/transformer_decoder_inference.js', 'js/omr/transformer_staff2score.js', 'js/omr/staff_parsing_tromr.js',
  'js/omr/staff_parsing.js', 'js/omr/runtime.js', 'js/omr/midi.js', 'js/omr/mxl.js',
  'js/omr/engine.js',
  'js/jam.js',
  'js/tuner.js',
  'js/trainer.js',
  'js/theorytab.js',
  'js/settings.js',
  'js/daw/synth.js',
  'js/daw/engine.js',
  'js/studio.js',
  'js/library.js',
  'js/arrange.js',
  'js/woodshed.js',
  'js/performance-engine.js',
  'js/performance-player.js',
  'js/practice-progress.js',
  'js/practice-progress-ui.js',
  'js/pitch-detector.js',
  'js/practice-input.js',
  'js/pads.js',
  'js/midihub.js',
  'js/synthdeck-maps.js',
  'js/synthdeck-scope.js',
  'js/synthdeck.js',
  'js/synthtab.js',
  'js/synthlive.js',
  'data/modx-performances.json',
  'js/lumi-practice.js',
  'js/xp.js',
  'js/quiz.js',
  'js/practiceplan.js',
  'js/helix.js',
  'js/help.js',
  'js/plugins.js',
  'manifest.webmanifest',
  'icons/icon-192.png',
  'icons/logo.svg',
  'icons/icon.svg',
  'icons/icon-512.png',
  'samples/bass/E1.mp3', 'samples/bass/A1.mp3', 'samples/bass/D2.mp3',
  'samples/bass/G2.mp3', 'samples/bass/C3.mp3',
  'samples/bassp/E1.mp3', 'samples/bassp/A1.mp3', 'samples/bassp/D2.mp3',
  'samples/bassp/G2.mp3', 'samples/bassp/C3.mp3',
  'samples/keys/C3.mp3', 'samples/keys/E3.mp3', 'samples/keys/A3.mp3',
  'samples/keys/C4.mp3', 'samples/keys/E4.mp3', 'samples/keys/A4.mp3',
  'samples/keys/C5.mp3',
  'samples/piano2/C3.mp3', 'samples/piano2/E3.mp3', 'samples/piano2/A3.mp3',
  'samples/piano2/C4.mp3', 'samples/piano2/E4.mp3', 'samples/piano2/A4.mp3',
  'samples/piano2/C5.mp3',
  'samples/epiano/C3.mp3', 'samples/epiano/E3.mp3', 'samples/epiano/A3.mp3',
  'samples/epiano/C4.mp3', 'samples/epiano/E4.mp3', 'samples/epiano/A4.mp3',
  'samples/epiano/C5.mp3',
  'samples/organ/C3.mp3', 'samples/organ/E3.mp3', 'samples/organ/A3.mp3',
  'samples/organ/C4.mp3', 'samples/organ/E4.mp3', 'samples/organ/A4.mp3',
  'samples/organ/C5.mp3',
  'samples/pad/C3.mp3', 'samples/pad/B3.mp3', 'samples/pad/E4.mp3',
  'samples/pad/G4.mp3', 'samples/pad/C5.mp3',
  'samples/guitar/E2.mp3', 'samples/guitar/A2.mp3', 'samples/guitar/C3.mp3',
  'samples/guitar/E3.mp3', 'samples/guitar/G3.mp3', 'samples/guitar/B3.mp3',
  'samples/guitar/E4.mp3', 'samples/guitar/G4.mp3', 'samples/guitar/A4.mp3',
  'samples/guitar/C5.mp3', 'samples/guitar/D5.mp3',
  'samples/eguitar/E2.mp3', 'samples/eguitar/A2.mp3', 'samples/eguitar/C3.mp3',
  'samples/eguitar/A3.mp3', 'samples/eguitar/Fs4.mp3', 'samples/eguitar/A4.mp3',
  'samples/eguitar/C5.mp3', 'samples/eguitar/Fs5.mp3', 'samples/eguitar/A5.mp3',
  'samples/nylon/E2.mp3', 'samples/nylon/A2.mp3', 'samples/nylon/D3.mp3',
  'samples/nylon/G3.mp3', 'samples/nylon/B3.mp3', 'samples/nylon/E4.mp3',
  'samples/nylon/A4.mp3', 'samples/nylon/D5.mp3', 'samples/nylon/E5.mp3',
  'samples/nylon/A5.mp3'
];

self.addEventListener('install', function (e) {
  e.waitUntil(
    caches.open(CACHE).then(function (c) {
      // cache:'reload' bypasses the HTTP cache so updates always precache fresh files
      return c.addAll(ASSETS.map(function (u) { return new Request(u, { cache: 'reload' }); }));
    }).then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys().then(function (keys) {
      // only this app's own old versions: 'soundlab-omr-*' (the OMR engine's models / runtime /
      // pdf.js, ~107 MB the owner chose to download) and other caches on the origin stay
      return Promise.all(keys.filter(function (k) { return k !== CACHE && k.indexOf('guitarlab-') === 0; }).map(function (k) { return caches.delete(k); }));
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function (e) {
  if (e.request.method !== 'GET') return;
  // never intercept cross-origin requests (e.g. the version.json update check)
  if (e.request.url.indexOf(self.location.origin) !== 0) return;
  // the OMR models (models/omr/, ~77 MB) and a same-origin runtime override (vendor/): straight to
  // the network, never into this cache (js/omr/runtime.js verifies and caches them itself)
  var rel = e.request.url.split(/[?#]/)[0].slice(self.registration ? self.registration.scope.length : self.location.origin.length);
  if (/^\/?(models\/omr|vendor)\//.test(rel)) return;
  e.respondWith(
    caches.match(e.request, { ignoreSearch: true }).then(function (hit) {
      return hit || fetch(e.request).then(function (res) {
        var copy = res.clone();
        caches.open(CACHE).then(function (c) { c.put(e.request, copy); });
        return res;
      });
    })
  );
});
