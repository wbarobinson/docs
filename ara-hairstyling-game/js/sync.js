/*
 * sync.js — the family account, ported from Ara's Number Jungle.
 *
 * No email, no password: one long random family code is the key. Type the
 * same code on another device and everyone's salon follows them there.
 * Local storage stays the source of truth; sync is additive and optional —
 * if the network is down or the server is asleep, play carries on and
 * nothing local is lost.
 */
;(function (root) {
  var SALON = (root.SalonStore = root.SalonStore || {})
  var META = 'arahairsalon.v1.sync'
  var ENDPOINT = '/api/progress'
  function api() { return (SALON.sync && SALON.sync.ENDPOINT) || ENDPOINT }
  var pushTimer = null
  var inFlight = false

  function meta() {
    try { return JSON.parse(root.localStorage.getItem(META)) || {} } catch (e) { return {} }
  }
  function saveMeta(m) {
    try { root.localStorage.setItem(META, JSON.stringify(m)) } catch (e) {}
  }

  function newCode() {
    var words = ['ribbon', 'sparkle', 'braid', 'blossom', 'seashell', 'tiara', 'velvet', 'peach', 'clover', 'comet']
    var pick = words[Math.floor(Math.random() * words.length)]
    var rand = ''
    var alphabet = 'abcdefghjkmnpqrstuvwxyz23456789'
    for (var i = 0; i < 10; i++) rand += alphabet[Math.floor(Math.random() * alphabet.length)]
    return pick + '-' + rand
  }

  function clean(code) {
    return String(code || '').trim().toLowerCase().replace(/[^a-z0-9-]/g, '')
  }

  function code() { return meta().code || null }

  function status() {
    var m = meta()
    return {
      code: m.code || null,
      version: m.version || 0,
      lastSyncAt: m.lastSyncAt || 0,
      lastError: m.lastError || null,
      busy: inFlight,
    }
  }

  function fetcher() { return root.fetch ? root.fetch.bind(root) : null }

  function pull() {
    var m = meta()
    var f = fetcher()
    if (!m.code || !f) return Promise.resolve({ ok: false, reason: 'no-code' })
    inFlight = true
    return f(api() + '?code=' + encodeURIComponent(m.code), { headers: { accept: 'application/json' } })
      .then(function (res) {
        if (res.status === 404) return { ok: true, empty: true }
        if (!res.ok) throw new Error('server said ' + res.status)
        return res.json()
      })
      .then(function (body) {
        inFlight = false
        if (body.empty) {
          saveMeta(Object.assign(m, { lastSyncAt: Date.now(), lastError: null }))
          return { ok: true, empty: true }
        }
        var merged = root.SalonMerge(SALON.store.load(), body.data)
        SALON.store.replace(merged)
        saveMeta(Object.assign(m, { version: body.version, lastSyncAt: Date.now(), lastError: null }))
        return { ok: true, version: body.version }
      })
      .catch(function (err) {
        inFlight = false
        saveMeta(Object.assign(meta(), { lastError: String(err.message || err) }))
        return { ok: false, reason: String(err.message || err) }
      })
  }

  // Compare-and-set: if someone else wrote while we were away, the server
  // hands back its copy, we merge it in and try once more.
  function push(retrying) {
    var m = meta()
    var f = fetcher()
    if (!m.code || !f) return Promise.resolve({ ok: false, reason: 'no-code' })
    inFlight = true
    var payload = { code: m.code, baseVersion: m.version || 0, data: SALON.store.load() }
    return f(api(), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    })
      .then(function (res) {
        return res.json().then(function (body) { return { status: res.status, body: body } })
      })
      .then(function (r) {
        inFlight = false
        if (r.status === 409 && !retrying) {
          var merged = root.SalonMerge(SALON.store.load(), r.body.data)
          SALON.store.replace(merged)
          saveMeta(Object.assign(meta(), { version: r.body.version }))
          return push(true)
        }
        if (r.status !== 200) throw new Error(r.body && r.body.error ? r.body.error : 'server said ' + r.status)
        saveMeta(Object.assign(meta(), { version: r.body.version, lastSyncAt: Date.now(), lastError: null }))
        return { ok: true, version: r.body.version }
      })
      .catch(function (err) {
        inFlight = false
        saveMeta(Object.assign(meta(), { lastError: String(err.message || err) }))
        return { ok: false, reason: String(err.message || err) }
      })
  }

  function create() {
    var m = meta()
    m.code = newCode()
    m.version = 0
    saveMeta(m)
    return push().then(function (r) { return Object.assign(r, { code: m.code }) })
  }

  function join(raw) {
    var c = clean(raw)
    if (c.length < 6) return Promise.resolve({ ok: false, reason: 'That code looks too short.' })
    saveMeta({ code: c, version: 0 })
    // Pull first so existing progress is folded in rather than replaced.
    return pull().then(function (r) {
      if (!r.ok) return r
      return push().then(function (p) { return Object.assign(p, { code: c }) })
    })
  }

  function leave() { saveMeta({}) }

  // Called after every client. Debounced, because a photo moment is busy.
  function schedule() {
    if (!code()) return
    if (pushTimer) root.clearTimeout(pushTimer)
    pushTimer = root.setTimeout(function () {
      pushTimer = null
      push()
    }, 2500)
  }

  function flush() {
    if (!code()) return Promise.resolve({ ok: false, reason: 'no-code' })
    if (pushTimer) { root.clearTimeout(pushTimer); pushTimer = null }
    return push()
  }

  SALON.sync = {
    META: META, ENDPOINT: ENDPOINT,
    code: code, status: status, newCode: newCode, clean: clean,
    create: create, join: join, leave: leave,
    pull: pull, push: push, schedule: schedule, flush: flush,
  }
})(typeof globalThis !== 'undefined' ? globalThis : this)
