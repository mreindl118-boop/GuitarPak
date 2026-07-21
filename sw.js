/* GuitarLab service worker — cache-first so the app works fully offline once visited. */
var CACHE = 'guitarlab-v35';
var ASSETS = [
  '.',
  'index.html',
  'css/style.css',
  'fonts/barlow-400.woff2',
  'fonts/barlow-500.woff2',
  'fonts/barlowcond-600.woff2',
  'fonts/barlowcond-700.woff2',
  'js/theory.js',
  'js/app.js',
  'js/metronome.js',
  'js/fretboard.js',
  'js/chords.js',
  'js/jam.js',
  'js/tuner.js',
  'js/trainer.js',
  'js/settings.js',
  'manifest.webmanifest',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'samples/bass/E1.mp3', 'samples/bass/A1.mp3', 'samples/bass/D2.mp3',
  'samples/bass/G2.mp3', 'samples/bass/C3.mp3',
  'samples/bassp/E1.mp3', 'samples/bassp/A1.mp3', 'samples/bassp/D2.mp3',
  'samples/bassp/G2.mp3', 'samples/bassp/C3.mp3',
  'samples/keys/C3.mp3', 'samples/keys/E3.mp3', 'samples/keys/A3.mp3',
  'samples/keys/C4.mp3', 'samples/keys/E4.mp3', 'samples/keys/A4.mp3',
  'samples/keys/C5.mp3',
  'samples/pad/C3.mp3', 'samples/pad/B3.mp3', 'samples/pad/E4.mp3',
  'samples/pad/G4.mp3', 'samples/pad/C5.mp3',
  'samples/guitar/E2.mp3', 'samples/guitar/A2.mp3', 'samples/guitar/C3.mp3',
  'samples/guitar/D3.mp3', 'samples/guitar/F3.mp3', 'samples/guitar/G3.mp3',
  'samples/guitar/A3.mp3', 'samples/guitar/B3.mp3', 'samples/guitar/D4.mp3',
  'samples/guitar/E4.mp3', 'samples/guitar/G4.mp3', 'samples/guitar/C5.mp3',
  'samples/guitar/E5.mp3',
  'samples/eguitar/E2.mp3', 'samples/eguitar/A2.mp3', 'samples/eguitar/D3.mp3',
  'samples/eguitar/G3.mp3', 'samples/eguitar/B3.mp3', 'samples/eguitar/E4.mp3',
  'samples/eguitar/G4.mp3', 'samples/eguitar/C5.mp3',
  'samples/nylon/E2.mp3', 'samples/nylon/A2.mp3', 'samples/nylon/D3.mp3',
  'samples/nylon/G3.mp3', 'samples/nylon/B3.mp3', 'samples/nylon/E4.mp3',
  'samples/nylon/G4.mp3', 'samples/nylon/C5.mp3'
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
