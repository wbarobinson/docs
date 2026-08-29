/*
 * merge.js — combining two copies of the same family's salon.
 *
 * Ported from Ara's Number Jungle. Neither copy is "right", so we never pick
 * a winner wholesale: logs are unioned, counters take the better number, and
 * a badge once earned is earned forever. merge(a, b) equals merge(b, a).
 */
;(function (root) {
  var SALON = (root.SalonStore = root.SalonStore || {})

  function maxOf(a, b) { return (a || 0) > (b || 0) ? a || 0 : b || 0 }
  function newer(a, b) { return (a.savedAt || 0) >= (b.savedAt || 0) ? a : b }

  function mergeWords(a, b) {
    var out = {}
    Object.keys(a || {}).forEach(function (k) { out[k] = a[k] })
    Object.keys(b || {}).forEach(function (k) {
      var mine = out[k], theirs = b[k]
      if (!mine) { out[k] = theirs; return }
      out[k] = {
        n: maxOf(mine.n, theirs.n),
        wrong: maxOf(mine.wrong, theirs.wrong),
        hints: maxOf(mine.hints, theirs.hints),
        level: maxOf(mine.level, theirs.level),
        lastAt: maxOf(mine.lastAt, theirs.lastAt),
      }
    })
    return out
  }

  function mergeDays(a, b) {
    var out = {}
    var keys = {}
    Object.keys(a || {}).forEach(function (k) { keys[k] = true })
    Object.keys(b || {}).forEach(function (k) { keys[k] = true })
    Object.keys(keys).forEach(function (day) {
      var x = (a || {})[day] || {}, y = (b || {})[day] || {}
      out[day] = {
        clients: maxOf(x.clients, y.clients),
        stars: maxOf(x.stars, y.stars),
        words: maxOf(x.words, y.words),
      }
    })
    return out
  }

  function mergeBadges(a, b) {
    var out = {}
    Object.keys(a || {}).forEach(function (k) { out[k] = a[k] })
    Object.keys(b || {}).forEach(function (k) {
      // Earned once, earned forever; the first time is the true one.
      out[k] = out[k] ? Math.min(out[k], b[k]) : b[k]
    })
    return out
  }

  function mergeLog(a, b) {
    var seen = {}
    var out = []
    ;(a || []).concat(b || []).forEach(function (e) {
      var key = e.id || e.t + ':' + e.kind
      if (seen[key]) return
      seen[key] = true
      out.push(e)
    })
    out.sort(function (x, y) { return (x.t || 0) - (y.t || 0) })
    return out
  }

  function mergeFlags(a, b) {
    var out = {}
    Object.keys(a || {}).forEach(function (k) { if (a[k]) out[k] = a[k] })
    Object.keys(b || {}).forEach(function (k) { if (b[k]) out[k] = b[k] })
    return out
  }

  function mergeProfile(x, y) {
    var f = (x.createdAt || 0) <= (y.createdAt || 0) ? x : y // keep the elder identity
    var fresher = newer(x, y)
    var out = {
      id: f.id,
      name: fresher.name || f.name,
      avatar: fresher.avatar || f.avatar,
      createdAt: Math.min(x.createdAt || Date.now(), y.createdAt || Date.now()),
      settings: Object.assign({}, x.settings, fresher.settings),
      words: mergeWords(x.words, y.words),
      level: maxOf(x.level, y.level) || 1,
      badges: mergeBadges(x.badges, y.badges),
      days: mergeDays(x.days, y.days),
      log: mergeLog(x.log, y.log),
      baseline: {
        clients: maxOf(x.baseline && x.baseline.clients, y.baseline && y.baseline.clients),
        stars: maxOf(x.baseline && x.baseline.stars, y.baseline && y.baseline.stars),
        wishes: maxOf(x.baseline && x.baseline.wishes, y.baseline && y.baseline.wishes),
        words: maxOf(x.baseline && x.baseline.words, y.baseline && y.baseline.words),
        photos: maxOf(x.baseline && x.baseline.photos, y.baseline && y.baseline.photos),
        fiveStar: maxOf(x.baseline && x.baseline.fiveStar, y.baseline && y.baseline.fiveStar),
      },
      streak: {
        best: maxOf(x.streak && x.streak.best, y.streak && y.streak.best),
        // The device used most recently is the only one that can speak to the
        // current run.
        current: (fresher.streak && fresher.streak.current) || 0,
        lastDay: (fresher.streak && fresher.streak.lastDay) || null,
      },
      flags: mergeFlags(x.flags, y.flags),
      totals: {}, styleCounts: {}, accCounts: {}, colorCounts: {}, clientCounts: {},
    }
    return out
  }

  function merge(a, b) {
    var profiles = []
    var byId = {}
    ;(a.profiles || []).forEach(function (p) { byId[p.id] = p })
    ;(b.profiles || []).forEach(function (p) {
      byId[p.id] = byId[p.id] ? mergeProfile(byId[p.id], p) : p
    })
    Object.keys(byId).forEach(function (id) { profiles.push(byId[id]) })
    profiles.sort(function (x, y) { return (x.createdAt || 0) - (y.createdAt || 0) })
    var freshest = newer(a, b)
    var out = {
      version: 1,
      activeId: freshest.activeId,
      profiles: profiles,
      savedAt: maxOf(a.savedAt, b.savedAt),
    }
    if (!profiles.some(function (p) { return p.id === out.activeId })) {
      out.activeId = profiles[0] && profiles[0].id
    }
    if (SALON.store && SALON.store.derive) profiles.forEach(SALON.store.derive)
    return out
  }

  root.SalonMerge = merge
})(typeof globalThis !== 'undefined' ? globalThis : this)
