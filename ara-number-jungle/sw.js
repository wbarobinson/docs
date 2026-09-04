/*
 * sw.js — offline shell.
 *
 * Network-first for our own files, with the cache as the offline fallback:
 * once it has been opened on wifi the whole app keeps working on a plane, in
 * the car, or with the iPad in aeroplane mode — but a deploy is picked up on
 * the very next load rather than days later.
 */
var CACHE = 'ara-jungle-v5'
var FILES = [
  './',
  './index.html',
  './css/app.css',
  './js/curriculum.js',
  './js/store.js',
  './js/merge.js',
  './js/sync.js',
  './js/badges.js',
  './js/audio.js',
  './js/juice.js',
  './js/picture.js',
  './js/engine.js',
  './js/ui.js',
  './js/play.js',
  './js/app.js',
  './manifest.webmanifest',
  './icons/icon-180.png',
  './icons/icon-512.png',
]

self.addEventListener('install', function (e) {
  e.waitUntil(
    caches.open(CACHE).then(function (c) {
      // addAll fails the whole install if one file 404s; individual puts are
      // more forgiving when a file has been renamed.
      return Promise.all(
        FILES.map(function (f) {
          return c.add(f).catch(function () {})
        }),
      )
    }),
  )
  self.skipWaiting()
})

self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(
        keys.map(function (k) {
          return k === CACHE ? null : caches.delete(k)
        }),
      )
    }),
  )
  self.clients.claim()
})

self.addEventListener('fetch', function (e) {
  if (e.request.method !== 'GET') return
  var url = new URL(e.request.url)
  if (url.origin !== self.location.origin) return

  // Network first, cache as the safety net.
  //
  // Cache-first was serving a stale app after every deploy: the old worker
  // keeps control of the page, so a child could practise for days on last
  // week's version. Since the whole app is under 200kb, fetching it fresh
  // costs nothing on wifi, and the cache is still there the moment the
  // network is not — which is the case offline support actually exists for.
  e.respondWith(
    fetch(e.request)
      .then(function (res) {
        if (res && res.ok) {
          var copy = res.clone()
          caches.open(CACHE).then(function (c) {
            c.put(e.request, copy).catch(function () {})
          })
        }
        return res
      })
      .catch(function () {
        return caches.match(e.request).then(function (hit) {
          return hit || caches.match('./index.html')
        })
      }),
  )
})
