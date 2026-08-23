/*
 * store.js — everything we remember about a learner.
 *
 * All local: one localStorage key, no accounts, no network. Multiple children
 * can share the iPad because everything hangs off a profile id.
 *
 * Per stage we keep the Kumon-style pair of numbers (score + time), plus a
 * per-fact record so the app can notice that "37 + 11" is the one that always
 * takes six seconds and quietly feed it back in.
 */
;(function (root) {
  var KM = (root.KM = root.KM || {})
  var KEY = 'aranumberjungle.v1'
  // A second copy of the last good state, and the set she is part way through.
  // Losing a practice session to a cleared tab is not acceptable.
  var BAK = KEY + '.bak'
  var SESSION = KEY + '.session'
  var storageOk = null // null until probed

  // autoCheck off by default: she should be able to backspace a fat-fingered
// digit before it is graded. Turn it on for pure speed runs.
var DEFAULT_SETTINGS = {
  sound: true,
  motion: true,
  // Off by default: a clock ticking up while you think is stressful, and the
  // set is timed either way. Grown-ups can switch it on.
  timer: false,
  setSize: 10,
  autoNext: true,
  autoCheck: false,
}

  function today() {
    var d = new Date()
    return (
      d.getFullYear() +
      '-' +
      String(d.getMonth() + 1).padStart(2, '0') +
      '-' +
      String(d.getDate()).padStart(2, '0')
    )
  }
  function daysBetween(a, b) {
    return Math.round((Date.parse(b + 'T00:00:00') - Date.parse(a + 'T00:00:00')) / 86400000)
  }
  function uid() {
    return 'p' + Date.now().toString(36) + Math.floor(Math.random() * 1e4).toString(36)
  }

  function newProfile(name, avatar) {
    return {
      id: uid(),
      name: name || 'Ara',
      avatar: avatar || '🦜',
      createdAt: Date.now(),
      settings: Object.assign({}, DEFAULT_SETTINGS),
      stageId: KM.DEFAULT_STAGE,
      unlockedTo: KM.DEFAULT_STAGE, // furthest stage reachable from the map
      stages: {}, // id -> { sets, problems, correct, bestMs, bestScore, stars, mastered, run, lastAt }
      facts: {}, // "27+11" -> { n, wrong, ms, lastMs, lastAt }
      badges: {}, // id -> earnedAt
      days: {}, // "2026-08-23" -> { sets, problems, correct, ms }
      streak: { current: 0, best: 0, lastDay: null },
      totals: { sets: 0, problems: 0, correct: 0, ms: 0, stars: 0, perfectSets: 0, bestCombo: 0 },
    }
  }

  var state = null

  // Can this browser actually keep anything? Safari on a file:// page and
  // private windows both say no, and the app should say so out loud rather
  // than pretend to save.
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
    var p = newProfile('Ara', '🦜')
    return { version: 1, activeId: p.id, profiles: [p] }
  }

  function load() {
    if (state) return state
    // Main copy, then the backup, then start over. A half-written main copy
    // must never cost her the whole history.
    var main = readJSON(KEY)
    if (looksValid(main)) state = main
    else {
      var bak = readJSON(BAK)
      state = looksValid(bak) ? bak : fresh()
      if (looksValid(bak)) state.restoredFromBackup = true
    }
    // Fill in anything a newer version of the app expects.
    state.profiles.forEach(function (p) {
      p.settings = Object.assign({}, DEFAULT_SETTINGS, p.settings || {})
      ;['stages', 'facts', 'badges', 'days'].forEach(function (k) {
        if (!p[k]) p[k] = {}
      })
      if (!p.streak) p.streak = { current: 0, best: 0, lastDay: null }
      p.totals = Object.assign(
        { sets: 0, problems: 0, correct: 0, ms: 0, stars: 0, perfectSets: 0, bestCombo: 0 },
        p.totals || {},
      )
      // One-off migration for profiles created when the timer was on by default.
      if (!p.settingsVersion) {
        p.settings.timer = false
        p.settingsVersion = 2
      }
      if (!p.stageId) p.stageId = KM.DEFAULT_STAGE
      if (!p.unlockedTo) p.unlockedTo = p.stageId
    })
    return state
  }

  // Called after every answered problem, not just at the end of a set.
  function save() {
    if (!canStore()) return false
    var s = load()
    s.savedAt = Date.now()
    try {
      var text = JSON.stringify(s)
      // Roll the last known-good copy into the backup slot first.
      var previous = root.localStorage.getItem(KEY)
      if (previous && looksValid(readJSON(KEY))) root.localStorage.setItem(BAK, previous)
      root.localStorage.setItem(KEY, text)
      return true
    } catch (e) {
      // Out of quota: drop the backup to make room and try once more, because
      // the live copy matters more than the spare.
      try {
        root.localStorage.removeItem(BAK)
        root.localStorage.setItem(KEY, JSON.stringify(s))
        return true
      } catch (e2) {
        return false
      }
    }
  }

  // --- the set she is half way through ----------------------------------

  function saveSession(snapshot) {
    if (!canStore()) return
    try {
      root.localStorage.setItem(SESSION, JSON.stringify(snapshot))
    } catch (e) {}
  }

  function loadSession() {
    var snap = readJSON(SESSION)
    if (!snap || !snap.problems || !snap.problems.length) return null
    // Anything older than a day is not "where she left off" any more.
    if (Date.now() - (snap.savedAt || 0) > 86400000) return null
    if (snap.i >= snap.problems.length) return null
    if (snap.profileId && snap.profileId !== load().activeId) return null
    return snap
  }

  function clearSession() {
    try {
      root.localStorage.removeItem(SESSION)
    } catch (e) {}
  }

  // --- backup you can paste somewhere safe ------------------------------

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
    if (!looksValid(incoming)) return { ok: false, error: 'No children found in that backup.' }
    var known = incoming.profiles.some(function (x) {
      return x.id === incoming.activeId
    })
    if (!known) incoming.activeId = incoming.profiles[0].id
    state = null // force a re-read through load(), which fills in any gaps
    try {
      root.localStorage.setItem(KEY, JSON.stringify(incoming))
    } catch (e) {
      return { ok: false, error: 'This browser will not let the app save.' }
    }
    load()
    return { ok: true, profiles: incoming.profiles.length }
  }

  function profile() {
    var s = load()
    for (var i = 0; i < s.profiles.length; i++) if (s.profiles[i].id === s.activeId) return s.profiles[i]
    s.activeId = s.profiles[0].id
    return s.profiles[0]
  }

  function stageRecord(p, id) {
    if (!p.stages[id]) {
      p.stages[id] = {
        sets: 0,
        problems: 0,
        correct: 0,
        bestMs: null,
        bestPerProblem: null,
        lastPerProblem: null,
        history: [], // seconds per problem, most recent last
        bestScore: null,
        stars: 0,
        mastered: false,
        run: 0,
        lastAt: null,
      }
    }
    return p.stages[id]
  }

  // --- recording ---------------------------------------------------------

  // One answered problem. `ms` is time from the problem appearing to the
  // first complete answer; `firstTry` is what mastery and facts care about.
  function recordProblem(p, prob, ms, firstTry) {
    var key = KM.factKey(prob)
    var f = p.facts[key] || (p.facts[key] = { n: 0, wrong: 0, ms: 0, lastMs: 0, lastAt: 0 })
    f.n++
    if (!firstTry) f.wrong++
    // Rolling average, weighted to recent attempts so improvement shows fast.
    f.ms = f.ms ? Math.round(f.ms * 0.6 + ms * 0.4) : ms
    f.lastMs = ms
    f.lastAt = Date.now()
  }

  // A finished set. Returns { stars, mastered, levelledUp, nextStageId, badges }.
  function recordSet(p, res) {
    var st = stageRecord(p, res.stageId)
    var stage = KM.stage(res.stageId)
    var perProblem = res.count ? res.ms / res.count / 1000 : 999
    var accuracy = res.count ? res.firstTry / res.count : 0
    var quick = perProblem <= stage.target
    var stars = res.stars

    st.sets++
    st.problems += res.count
    st.correct += res.firstTry
    st.stars = Math.max(st.stars, stars)
    st.lastAt = Date.now()
    if (st.bestMs === null || res.ms < st.bestMs) st.bestMs = res.ms
    if (!st.bestPerProblem || perProblem < st.bestPerProblem) st.bestPerProblem = perProblem
    st.lastPerProblem = perProblem
    if (!st.history) st.history = []
    st.history.push(Math.round(perProblem * 10) / 10)
    if (st.history.length > 12) st.history = st.history.slice(-12)
    if (st.bestScore === null || accuracy > st.bestScore) st.bestScore = accuracy

    // Mastery, the Kumon way: three sets in a row that are both accurate and
    // quick. One slow or scrappy set resets the run — no shortcuts up.
    var qualifies = accuracy >= 0.9 && quick
    st.run = qualifies ? st.run + 1 : 0
    var justMastered = false
    if (!st.mastered && st.run >= 3) {
      st.mastered = true
      justMastered = true
    }

    p.totals.sets++
    p.totals.problems += res.count
    p.totals.correct += res.firstTry
    p.totals.ms += res.ms
    p.totals.stars += stars
    if (accuracy === 1) p.totals.perfectSets++
    p.totals.bestCombo = Math.max(p.totals.bestCombo, res.bestCombo || 0)

    var d = p.days[today()] || (p.days[today()] = { sets: 0, problems: 0, correct: 0, ms: 0 })
    d.sets++
    d.problems += res.count
    d.correct += res.firstTry
    d.ms += res.ms

    touchStreak(p)

    // Moving on: mastery advances her; a good-but-not-quick run still unlocks
    // the next stage on the map so she is never stuck on one screen.
    var next = KM.nextStage(res.stageId)
    var levelledUp = false
    if (justMastered && next) {
      p.stageId = next.id
      if (KM.stageIndex(next.id) > KM.stageIndex(p.unlockedTo)) p.unlockedTo = next.id
      levelledUp = KM.stage(res.stageId).level !== next.level
    }

    return {
      stars: stars,
      accuracy: accuracy,
      perProblem: perProblem,
      quick: quick,
      run: st.run,
      mastered: justMastered,
      levelledUp: levelledUp,
      nextStageId: justMastered && next ? next.id : null,
      isBestTime: st.bestMs === res.ms && st.sets > 1,
    }
  }

  function touchStreak(p) {
    var t = today()
    var s = p.streak
    if (s.lastDay === t) return
    if (s.lastDay && daysBetween(s.lastDay, t) === 1) s.current++
    else s.current = 1
    s.lastDay = t
    s.best = Math.max(s.best, s.current)
  }

  // --- reading ----------------------------------------------------------

  // The facts she is slowest or shakiest on. Feeds both the "tricky facts"
  // sprinkle during play and the grown-ups screen.
  function trickyFacts(p, limit) {
    var out = []
    Object.keys(p.facts).forEach(function (k) {
      var f = p.facts[k]
      if (f.n < 2) return
      var wrongRate = f.wrong / f.n
      // A wrong answer hurts about as much as being three seconds slow.
      var pain = wrongRate * 3000 + f.ms
      if (wrongRate > 0 || f.ms > 5000) out.push({ key: k, pain: pain, wrongRate: wrongRate, ms: f.ms, n: f.n })
    })
    out.sort(function (a, b) {
      return b.pain - a.pain
    })
    return out.slice(0, limit || 10)
  }

  function recentDays(p, n) {
    var out = []
    var d = new Date()
    for (var i = n - 1; i >= 0; i--) {
      var x = new Date(d.getTime() - i * 86400000)
      var key =
        x.getFullYear() + '-' + String(x.getMonth() + 1).padStart(2, '0') + '-' + String(x.getDate()).padStart(2, '0')
      out.push(Object.assign({ date: key, sets: 0, problems: 0, correct: 0, ms: 0 }, p.days[key] || {}))
    }
    return out
  }

  function levelProgress(p, levelId) {
    var stages = KM.stagesOfLevel(levelId)
    var done = stages.filter(function (s) {
      return (p.stages[s.id] || {}).mastered
    }).length
    return { done: done, total: stages.length, pct: stages.length ? done / stages.length : 0 }
  }

  KM.store = {
    KEY: KEY,
    BAK: BAK,
    SESSION: SESSION,
    canStore: canStore,
    saveSession: saveSession,
    loadSession: loadSession,
    clearSession: clearSession,
    exportText: exportText,
    importText: importText,
    load: load,
    save: save,
    profile: profile,
    profiles: function () {
      return load().profiles
    },
    setActive: function (id) {
      load().activeId = id
      save()
    },
    addProfile: function (name, avatar) {
      var p = newProfile(name, avatar)
      load().profiles.push(p)
      load().activeId = p.id
      save()
      return p
    },
    removeProfile: function (id) {
      var s = load()
      s.profiles = s.profiles.filter(function (p) {
        return p.id !== id
      })
      if (!s.profiles.length) s.profiles.push(newProfile('Ara', '🦜'))
      if (s.activeId === id) s.activeId = s.profiles[0].id
      save()
    },
    newProfile: newProfile,
    stageRecord: stageRecord,
    recordProblem: recordProblem,
    recordSet: recordSet,
    trickyFacts: trickyFacts,
    recentDays: recentDays,
    levelProgress: levelProgress,
    today: today,
    reset: function () {
      state = fresh()
      clearSession()
      save()
    },
  }
})(typeof globalThis !== 'undefined' ? globalThis : this)
