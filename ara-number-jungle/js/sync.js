/*
 * sync.js — the family account.
 *
 * No email, no password, no personal data: one long random family code acts as
 * the key. Type the same code on another device and both children's progress
 * follows them there.
 *
 * Local storage stays the source of truth. Sync is additive and always
 * optional: if the network is down, the server is asleep, or the code is
 * wrong, practice carries on exactly as before and nothing local is lost.
 */
;(function (root) {
  var KM = (root.KM = root.KM || {})
  var META = 'aranumberjungle.v1.sync'
  // Read through KM.sync.ENDPOINT so it can be pointed elsewhere (tests, a
  // separate API host) rather than being baked in at load time.
  var ENDPOINT = '/api/progress'
  function api() {
    return (KM.sync && KM.sync.ENDPOINT) || ENDPOINT
  }
  var pushTimer = null
  var inFlight = false

  function meta() {
    try {
      return JSON.parse(root.localStorage.getItem(META)) || {}
    } catch (e) {
      return {}
    }
  }
  function saveMeta(m) {
    try {
      root.localStorage.setItem(META, JSON.stringify(m))
    } catch (e) {}
  }

  // Readable enough to say out loud, random enough that nobody stumbles onto
  // someone else's practice history.
  function newCode() {
    var words = ['fern', 'nest', 'volcano', 'canopy', 'river', 'boulder', 'thunder', 'meadow', 'comet', 'amber']
    var pick = words[Math.floor(Math.random() * words.length)]
    var rand = ''
    var alphabet = 'abcdefghjkmnpqrstuvwxyz23456789'
    for (var i = 0; i < 10; i++) rand += alphabet[Math.floor(Math.random() * alphabet.length)]
    return pick + '-' + rand
  }

  function clean(code) {
    return String(code || '')
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, '')
  }

  function code() {
    return meta().code || null
  }

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

  function fetcher() {
    return root.fetch ? root.fetch.bind(root) : null
  }

  // --- talking to the server ---------------------------------------------

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
        var merged = KM.merge(KM.store.load(), body.data)
        KM.store.replace(merged)
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
    var payload = { code: m.code, baseVersion: m.version || 0, data: KM.store.load() }
    return f(api(), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    })
      .then(function (res) {
        return res.json().then(function (body) {
          return { status: res.status, body: body }
        })
      })
      .then(function (r) {
        inFlight = false
        if (r.status === 409 && !retrying) {
          // Someone else's newer copy: fold it in and push the union.
          var merged = KM.merge(KM.store.load(), r.body.data)
          KM.store.replace(merged)
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

  // --- what the app calls ------------------------------------------------

  function create() {
    var m = meta()
    m.code = newCode()
    m.version = 0
    saveMeta(m)
    return push().then(function (r) {
      return Object.assign(r, { code: m.code })
    })
  }

  function join(raw) {
    var c = clean(raw)
    if (c.length < 6) return Promise.resolve({ ok: false, reason: 'That code looks too short.' })
    saveMeta({ code: c, version: 0 })
    // Pull first so their existing progress is folded in rather than replaced.
    return pull().then(function (r) {
      if (!r.ok) return r
      return push().then(function (p) {
        return Object.assign(p, { code: c })
      })
    })
  }

  function leave() {
    saveMeta({})
  }

  // Called after every set. Debounced, because a set ends with a lot going on.
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
    if (pushTimer) {
      root.clearTimeout(pushTimer)
      pushTimer = null
    }
    return push()
  }

  KM.sync = {
    META: META,
    ENDPOINT: ENDPOINT,
    code: code,
    status: status,
    newCode: newCode,
    clean: clean,
    create: create,
    join: join,
    leave: leave,
    pull: pull,
    push: push,
    schedule: schedule,
    flush: flush,
  }
})(typeof globalThis !== 'undefined' ? globalThis : this)
