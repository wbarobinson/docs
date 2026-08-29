/*
 * store.js — everything the salon remembers about a stylist.
 *
 * Ported from Ara's Number Jungle: one localStorage key, a backup copy of the
 * last good state, and a session key for the makeover she is half way
 * through. Ara and Jon get fixed profile ids so a family-code merge
 * recognises the same child on every device.
 *
 * Totals are derived from an append-only log plus a frozen baseline, because
 * two devices are merged by taking the union of their logs — max loses work
 * and sum double-counts.
 */
;(function (root) {
  var SALON = (root.SalonStore = root.SalonStore || {})
  var KEY = 'arahairsalon.v1'
  var BAK = KEY + '.bak'
  var SESSION = KEY + '.session'
  var GALLERY = KEY + '.gallery.' // + profile id; photos are heavy, kept apart
  var storageOk = null

  var DEFAULT_SETTINGS = { sound: true, party: true }

  function today() {
    var d = new Date()
    return (
      d.getFullYear() + '-' +
      String(d.getMonth() + 1).padStart(2, '0') + '-' +
      String(d.getDate()).padStart(2, '0')
    )
  }

  function uid() {
    return Date.now().toString(36) + Math.floor(Math.random() * 1e6).toString(36)
  }

  function newProfile(name, avatar, id) {
    return {
      id: id || 'p' + uid(),
      name: name || 'Ara',
      avatar: avatar || '🦜',
      createdAt: Date.now(),
      settings: Object.assign({}, DEFAULT_SETTINGS),
      // "cat" -> { n, wrong, hints, lastAt, level } — every word she has read
      words: {},
      level: 1, // current reading level, moves up as words stick
      badges: {}, // id -> earnedAt
      days: {}, // "2026-08-29" -> { clients, stars, words }
      // Append-only record of finished clients and word rounds. Merging two
      // devices is the union of their logs; totals fall out of that.
      log: [],
      baseline: { clients: 0, stars: 0, wishes: 0, words: 0, photos: 0, fiveStar: 0 },
      streak: { current: 0, best: 0, lastDay: null },
      flags: {}, // one-off event flags: usedRealPhoto, rainbowInOneLook
      totals: { clients: 0, stars: 0, wishes: 0, words: 0, photos: 0, fiveStar: 0 },
      styleCounts: {}, accCounts: {}, colorCounts: {}, clientCounts: {},
    }
  }

  var state = null

  function canStore() {
    if (storageOk !== null) return storageOk
    try {
      root.localStorage.setItem(KEY + '.probe', '1')
      root.localStorage.removeItem(KEY + '.probe')
      storageOk = true
    } catch (e) {
      storageOk = false
    }
    return storageOk
  }

  function readJSON(key) {
    try {
      var raw = root.localStorage.getItem(key)
      return raw ? JSON.parse(raw) : null
    } catch (e) {
      return null
    }
  }

  function looksValid(x) {
    return !!(x && x.profiles && x.profiles.length && x.profiles[0].id)
  }

  function fresh() {
    var ara = newProfile('Ara', '🦜', 'ara')
    var jon = newProfile('Jon', '🦖', 'jon')
    return { version: 1, activeId: ara.id, profiles: [ara, jon] }
  }

  /* Recompute derived numbers from baseline + log. Runs on load and after
     merges, so a bug can never leave the totals drifting from the record. */
  function derive(p) {
    var t = {
      clients: p.baseline.clients || 0,
      stars: p.baseline.stars || 0,
      wishes: p.baseline.wishes || 0,
      words: p.baseline.words || 0,
      photos: p.baseline.photos || 0,
      fiveStar: p.baseline.fiveStar || 0,
    }
    var style = {}, acc = {}, color = {}, who = {}
    p.log.forEach(function (e) {
      if (e.kind === 'client') {
        t.stars += e.stars || 0
        // Exactly one event per visit can carry a final score of five: a
        // re-shoot only exists when it improved, so it cannot repeat a five.
        if ((e.finalStars || e.stars) >= 5) t.fiveStar++
        // A re-shoot of the same visit pays its star improvement only; the
        // visit itself, and everything "per client", was already counted.
        if (e.reshoot) return
        t.clients++
        t.wishes += e.got || 0
        if (e.photo) t.photos++
        if (e.style) style[e.style] = (style[e.style] || 0) + 1
        ;(e.accs || []).forEach(function (a) { acc[a] = (acc[a] || 0) + 1 })
        ;(e.colors || []).forEach(function (c) { color[c] = (color[c] || 0) + 1 })
        if (e.client) who[e.client] = (who[e.client] || 0) + 1
      } else if (e.kind === 'word') {
        t.words++
        t.stars += e.stars || 0
      }
    })
    p.totals = t
    p.styleCounts = style
    p.accCounts = acc
    p.colorCounts = color
    p.clientCounts = who
  }

  function load() {
    if (state) return state
    var main = readJSON(KEY)
    if (looksValid(main)) state = main
    else {
      var bak = readJSON(BAK)
      state = looksValid(bak) ? bak : fresh()
      if (looksValid(bak)) state.restoredFromBackup = true
    }

    normaliseSeededIds(state)
    if (!state.profiles.some(function (p) { return p.id === 'jon' || p.name === 'Jon' })) {
      state.profiles.push(newProfile('Jon', '🦖', 'jon'))
    }

    state.profiles.forEach(function (p) {
      p.settings = Object.assign({}, DEFAULT_SETTINGS, p.settings || {})
      ;['words', 'badges', 'days', 'flags'].forEach(function (k) { if (!p[k]) p[k] = {} })
      if (!p.streak) p.streak = { current: 0, best: 0, lastDay: null }
      if (!p.log) p.log = []
      if (!p.baseline) p.baseline = { clients: 0, stars: 0, wishes: 0, words: 0, photos: 0, fiveStar: 0 }
      if (!p.level) p.level = 1
      derive(p)
    })
    return state
  }

  function normaliseSeededIds(state) {
    ;[{ id: 'ara', name: 'Ara' }, { id: 'jon', name: 'Jon' }].forEach(function (seed) {
      if (state.profiles.some(function (p) { return p.id === seed.id })) return
      var candidates = state.profiles.filter(function (p) { return p.name === seed.name })
      if (candidates.length !== 1) return
      var was = candidates[0].id
      candidates[0].id = seed.id
      if (state.activeId === was) state.activeId = seed.id
    })
  }

  function save() {
    if (!canStore()) return false
    var s = load()
    s.savedAt = Date.now()
    try {
      var text = JSON.stringify(s)
      var previous = root.localStorage.getItem(KEY)
      if (previous && looksValid(readJSON(KEY))) root.localStorage.setItem(BAK, previous)
      root.localStorage.setItem(KEY, text)
      if (SALON.sync && SALON.sync.schedule) SALON.sync.schedule()
      return true
    } catch (e) {
      // Out of quota. Photos are re-takeable and the backup is not, so the
      // gallery goes first, the backup last.
      try {
        s.profiles.forEach(function (p) {
          try { root.localStorage.removeItem(GALLERY + p.id) } catch (e3) {}
        })
        root.localStorage.setItem(KEY, JSON.stringify(s))
        return true
      } catch (e2) {
        try {
          root.localStorage.removeItem(BAK)
          root.localStorage.setItem(KEY, JSON.stringify(s))
          return true
        } catch (e4) {
          return false
        }
      }
    }
  }

  function replace(next) {
    if (!looksValid(next)) return false
    state = next
    state.profiles.forEach(derive)
    return save()
  }

  function profile() {
    var s = load()
    for (var i = 0; i < s.profiles.length; i++) {
      if (s.profiles[i].id === s.activeId) return s.profiles[i]
    }
    s.activeId = s.profiles[0].id
    return s.profiles[0]
  }

  function setActive(id) {
    var s = load()
    if (s.profiles.some(function (p) { return p.id === id })) {
      s.activeId = id
      save()
    }
    return profile()
  }

  /* ---------- recording what happened ---------------------------------- */

  function bumpDay(p, field, by) {
    var d = today()
    if (!p.days[d]) p.days[d] = { clients: 0, stars: 0, words: 0 }
    p.days[d][field] = (p.days[d][field] || 0) + (by || 1)
    // A gentle streak: doing anything today counts, and a missed day just
    // starts a fresh run — no scolding, the best run is remembered forever.
    var st = p.streak
    if (st.lastDay !== d) {
      var yesterday = new Date(Date.now() - 86400000)
      var y = yesterday.getFullYear() + '-' +
        String(yesterday.getMonth() + 1).padStart(2, '0') + '-' +
        String(yesterday.getDate()).padStart(2, '0')
      st.current = st.lastDay === y ? st.current + 1 : 1
      if (st.current > st.best) st.best = st.current
      st.lastDay = d
    }
  }

  function recordClient(ev) {
    var p = profile()
    p.log.push({
      id: uid(), t: Date.now(), kind: 'client',
      stars: ev.stars, got: ev.got, total: ev.total,
      reshoot: !!ev.reshoot, finalStars: ev.finalStars || ev.stars,
      style: ev.style, accs: ev.accs || [], colors: ev.colors || [],
      client: ev.client, photo: !!ev.photo,
    })
    if (ev.photo) p.flags.usedRealPhoto = true
    if (ev.rainbow) p.flags.rainbowInOneLook = true
    if (!ev.reshoot) bumpDay(p, 'clients')
    bumpDay(p, 'stars', ev.stars)
    derive(p)
    save()
    return p
  }

  function recordWord(word, ok, level, hinted) {
    var p = profile()
    var w = p.words[word] || { n: 0, wrong: 0, hints: 0, level: level || 1, lastAt: 0 }
    if (ok) w.n++
    else if (!hinted) w.wrong++ // "say it" is help asked for, never a fail
    if (hinted) w.hints++
    w.level = level || w.level
    w.lastAt = Date.now()
    p.words[word] = w
    if (ok) {
      p.log.push({ id: uid(), t: Date.now(), kind: 'word', word: word, stars: 1 })
      bumpDay(p, 'words')
      bumpDay(p, 'stars', 1)
    }
    derive(p)
    save()
    return p
  }

  function earnBadge(id) {
    var p = profile()
    if (p.badges[id]) return false
    p.badges[id] = Date.now()
    save()
    return true
  }

  /* ---------- the makeover she is half way through ---------------------- */

  function saveSession(snapshot) {
    if (!canStore()) return
    snapshot.profileId = load().activeId
    snapshot.savedAt = Date.now()
    try {
      root.localStorage.setItem(SESSION, JSON.stringify(snapshot))
    } catch (e) {}
  }

  function loadSession() {
    var snap = readJSON(SESSION)
    if (!snap || !snap.strands || !snap.strands.length) return null
    if (Date.now() - (snap.savedAt || 0) > 86400000) return null
    if (snap.profileId && snap.profileId !== load().activeId) return null
    return snap
  }

  function clearSession() {
    try { root.localStorage.removeItem(SESSION) } catch (e) {}
  }

  /* ---------- the sticker book ------------------------------------------ */
  /* Photos are dataURLs and dwarf everything else, so they live under their
     own per-profile key, outside the merged/exported state. */

  function galleryKey() { return GALLERY + load().activeId }

  function galleryAll() {
    return readJSON(galleryKey()) || []
  }

  // Budgeted by bytes, not count: small stickers mean she keeps dozens, and
  // nothing is ever silently chopped to a handful.
  var GALLERY_BUDGET = 1200000

  function galleryAdd(data) {
    var list = galleryAll()
    list.unshift(data)
    var bytes = list.reduce(function (n, d) { return n + d.length }, 0)
    while (list.length > 1 && bytes > GALLERY_BUDGET) {
      bytes -= list.pop().length
    }
    for (;;) {
      try {
        root.localStorage.setItem(galleryKey(), JSON.stringify(list))
        break
      } catch (e) {
        if (list.length <= 1) break
        list.pop() // quota squeeze: drop the oldest, one at a time
      }
    }
    return list
  }

  function galleryClear() {
    try { root.localStorage.removeItem(galleryKey()) } catch (e) {}
  }

  /* ---------- backup you can paste somewhere safe ------------------------ */

  function exportText() {
    return JSON.stringify(load())
  }

  function importText(text) {
    var incoming
    try {
      incoming = JSON.parse(String(text).trim())
    } catch (e) {
      return { ok: false, error: 'That does not look like a backup — it should start with {' }
    }
    if (!looksValid(incoming)) return { ok: false, error: 'No stylists found in that backup.' }
    // Never lose local work to a paste: merge, don't overwrite.
    var merged = root.SalonMerge ? root.SalonMerge(load(), incoming) : incoming
    state = null
    try {
      root.localStorage.setItem(KEY, JSON.stringify(merged))
    } catch (e) {
      return { ok: false, error: 'This browser will not let the app save.' }
    }
    load()
    return { ok: true, profiles: merged.profiles.length }
  }

  SALON.store = {
    KEY: KEY,
    canStore: canStore,
    load: load,
    save: save,
    replace: replace,
    profile: profile,
    setActive: setActive,
    newProfile: newProfile,
    recordClient: recordClient,
    recordWord: recordWord,
    earnBadge: earnBadge,
    saveSession: saveSession,
    loadSession: loadSession,
    clearSession: clearSession,
    galleryAll: galleryAll,
    galleryAdd: galleryAdd,
    galleryClear: galleryClear,
    exportText: exportText,
    importText: importText,
    today: today,
    derive: derive,
  }
})(typeof globalThis !== 'undefined' ? globalThis : this)
