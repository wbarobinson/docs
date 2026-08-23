/*
 * sw.js — offline shell.
 *
 * Cache-first for our own files: once it has been opened on wifi the whole app
 * keeps working on a plane, in the car, or with the iPad in aeroplane mode
 * (which is not a bad way to run a practice session).
 * Bump CACHE when the files change.
 */
var CACHE = 'ara-jungle-v1'
var FILES = [
  './',
  './index.html',
  './css/app.css',
  './js/curriculum.js',
  './js/store.js',
  './js/badges.js',
  './js/audio.js',
  './js/juice.js',
  './js/engine.js',
  './js/ui.js',
  './js/play.js',
  './js/app.js',
  './manifest.webmanifest',
  './icons/icon.svg',
  './icons/leaves.svg',
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
  e.respondWith(
    caches.match(e.request).then(function (hit) {
      if (hit) return hit
      return fetch(e.request)
        .then(function (res) {
          var copy = res.clone()
          caches.open(CACHE).then(function (c) {
            c.put(e.request, copy).catch(function () {})
          })
          return res
        })
        .catch(function () {
          return caches.match('./index.html')
        })
    }),
  )
})
