/* GuitarLab service worker — cache-first so the app works fully offline once visited. */
var CACHE = 'guitarlab-v86';
var ASSETS = [
  '.',
  'index.html',
  'css/style.css',
  'fonts/barlow-400.woff2',
  'fonts/barlow-500.woff2',
  'fonts/barlowcond-600.woff2',
  'fonts/barlowcond-700.woff2',
  'fonts/bebasneue-400.ttf',
  'js/theory.js',
  'js/app.js',
  'js/midi.js',
  'js/metronome.js',
  'js/fretboard.js',
  'js/chords.js',
  'js/piano.js',
  'js/songs.js',
  'js/jam.js',
  'js/tuner.js',
  'js/trainer.js',
  'js/theorytab.js',
  'js/settings.js',
  'js/daw/synth.js',
  'js/daw/engine.js',
  'js/studio.js',
  'js/arrange.js',
  'js/woodshed.js',
  'js/pads.js',
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
      return Promise.all(keys.filter(function (k) { return k !== CACHE; }).map(function (k) { return caches.delete(k); }));
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function (e) {
  if (e.request.method !== 'GET') return;
  // never intercept cross-origin requests (e.g. the version.json update check)
  if (e.request.url.indexOf(self.location.origin) !== 0) return;
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
