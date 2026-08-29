/* Caches the salon so it keeps working with no wifi (in the car, on a plane). */
var CACHE = 'ara-salon-16ab460f05'; // build.js stamps a content hash here
var FILES = [
  './', './index.html', './style.css',
  './js/hair.js', './js/render.js', './js/store.js', './js/merge.js',
  './js/sync.js', './js/words.js', './js/clients.js', './js/audio.js',
  './js/badges.js', './js/party.js', './js/game.js',
  './manifest.webmanifest', './icon.png', './icon-192.png', './icon-512.png'
];

self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(CACHE).then(function (c) { return c.addAll(FILES); }).then(function () {
    return self.skipWaiting();
  }));
});

self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.map(function (k) { return k === CACHE ? null : caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});

self.addEventListener('fetch', function (e) {
  if (e.request.method !== 'GET') { return; }
  // Never intercept the sync API or anything cross-origin: a cached
  // /api/progress response would freeze the family code at its first pull.
  var url = new URL(e.request.url);
  if (url.origin !== location.origin || url.pathname.indexOf('/api/') === 0) { return; }
  // Navigations are served from the stamped cache, so the page and its
  // assets always come from the SAME release and swap atomically when a new
  // worker activates. The network copy refreshes that cache in the
  // background for next time.
  if (e.request.mode === 'navigate') {
    e.respondWith(
      caches.open(CACHE).then(function (c) {
        return c.match('./index.html').then(function (hit) {
          var refresh = fetch(e.request).then(function (res) {
            c.put('./index.html', res.clone());
            return res;
          });
          return hit || refresh;
        });
      }).catch(function () { return fetch(e.request); })
    );
    return;
  }
  e.respondWith(
    caches.match(e.request).then(function (hit) {
      return hit || fetch(e.request).then(function (res) {
        var copy = res.clone();
        caches.open(CACHE).then(function (c) { c.put(e.request, copy); });
        return res;
      });
    })
  );
});
