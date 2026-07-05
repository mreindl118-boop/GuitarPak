/* GuitarLab service worker — cache-first so the app works fully offline once visited. */
var CACHE = 'guitarlab-v8';
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
  'js/tuner.js',
  'js/trainer.js',
  'manifest.webmanifest',
  'icons/icon-192.png',
  'icons/icon-512.png'
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
