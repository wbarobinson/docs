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
  // Points that finish a day. Every set earns one, and a broken run pays a
  // bonus, so five is a comfortable evening.
  dayGoal: 5,
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

  function newProfile(name, avatar, theme, id) {
    return {
      id: id || uid(),
      name: name || 'Ara',
      avatar: avatar || '🦜',
      theme: theme || KM.DEFAULT_THEME,
      createdAt: Date.now(),
      settings: Object.assign({}, DEFAULT_SETTINGS),
      stageId: KM.DEFAULT_STAGE,
      unlockedTo: KM.DEFAULT_STAGE, // furthest stage reachable from the map
      stages: {}, // id -> { sets, problems, correct, bestMs, bestScore, stars, mastered, run, lastAt }
      facts: {}, // "27+11" -> { n, wrong, ms, lastMs, lastAt }
      badges: {}, // id -> earnedAt
      days: {}, // "2026-08-23" -> { sets, problems, correct, ms }
      // Append-only record of finished sets. Two devices can be merged by
      // taking the union of their logs, which is why totals are derived from
      // this rather than merged as counters (max loses work, sum double-counts).
      log: [],
      // Whatever was already counted before logging existed.
      baseline: { sets: 0, problems: 0, correct: 0, ms: 0, stars: 0, perfectSets: 0 },
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

  // The two children who ship with the app get fixed ids, not random ones.
  // Two devices must recognise the same child when a family account merges
  // them, and a random id per device would give you two Aras.
  function fresh() {
    var ara = newProfile('Ara', '🦜', 'jungle', 'ara')
    var jon = newProfile('Jon', '🦖', 'dino', 'jon')
    return { version: 1, activeId: ara.id, profiles: [ara, jon] }
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
    // Installs that predate Jon get him added once, without touching anyone
    // else's progress.
    if (!state.seededJon) {
      state.seededJon = true
      var hasJon = state.profiles.some(function (x) {
        return x.theme === 'dino' || x.name === 'Jon'
      })
      if (!hasJon) state.profiles.push(newProfile('Jon', '🦖', 'dino', 'jon'))
    }

    normaliseSeededIds(state)

    // Fill in anything a newer version of the app expects.
    state.profiles.forEach(function (p) {
      p.settings = Object.assign({}, DEFAULT_SETTINGS, p.settings || {})
      ;['stages', 'facts', 'badges', 'days'].forEach(function (k) {
        if (!p[k]) p[k] = {}
      })
      if (!p.streak) p.streak = { current: 0, best: 0, lastDay: null }
      if (!p.log) {
        // Existing history predates the log: freeze it as the baseline so the
        // numbers do not change under anyone's feet.
        p.log = []
        p.baseline = {
          sets: (p.totals && p.totals.sets) || 0,
          problems: (p.totals && p.totals.problems) || 0,
          correct: (p.totals && p.totals.correct) || 0,
          ms: (p.totals && p.totals.ms) || 0,
          stars: (p.totals && p.totals.stars) || 0,
          perfectSets: (p.totals && p.totals.perfectSets) || 0,
        }
      }
      if (!p.baseline) p.baseline = { sets: 0, problems: 0, correct: 0, ms: 0, stars: 0, perfectSets: 0 }
      p.totals = Object.assign(
        { sets: 0, problems: 0, correct: 0, ms: 0, stars: 0, perfectSets: 0, bestCombo: 0 },
        p.totals || {},
      )
      if (!p.theme) p.theme = KM.DEFAULT_THEME
      if (!p.settings.dayGoal) p.settings.dayGoal = 5
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
  // Installs made before the ids were fixed have a random-id Ara and Jon.
  // Rename them once, so a family account merges them with every other device
  // instead of stacking up duplicates.
  function normaliseSeededIds(state) {
    ;[
      { id: 'ara', name: 'Ara' },
      { id: 'jon', name: 'Jon' },
    ].forEach(function (seed) {
      var taken = state.profiles.some(function (p) {
        return p.id === seed.id
      })
      if (taken) return
      var candidates = state.profiles.filter(function (p) {
        return p.name === seed.name
      })
      if (candidates.length !== 1) return // ambiguous: leave well alone
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
    // quick. One slow or scrappy set resets the run — no credit is carried,
    // because "in a row" is the whole point of it.
    //
    // The consolation for a lost run lives on the DAY instead: every good set
    // counts towards today's goal whether or not a later wobble breaks the
    // run, so an evening's work is never worth nothing.
    var qualifies = accuracy >= 0.9 && quick
    var runBefore = st.run
    st.run = qualifies ? st.run + 1 : 0

    // Day points, which is where a broken run is made good:
    //   every finished set                          +1
    //   a set that breaks a run of N good ones      +N
    // So 3★, 3★, 2★ pays 1 + 1 + (1 + 2) = 5 points, more than the three
    // clean sets that would have levelled her up. The run is gone, but the
    // evening counted for MORE, not less.
    var bonusPoints = qualifies ? 0 : runBefore
    var pointsEarned = 1 + bonusPoints
    var justMastered = false
    if (!st.mastered && st.run >= 3) {
      st.mastered = true
      justMastered = true
    }

    // One line per set, with an id no other device will generate.
    p.log.push({
      id: uid() + '-' + p.log.length,
      at: Date.now(),
      day: today(),
      stageId: res.stageId,
      count: res.count,
      firstTry: res.firstTry,
      ms: res.ms,
      stars: stars,
      // Good = the same bar the run uses. Both of these are kept per set so a
      // day's tally can be rebuilt from the log when two devices merge.
      good: qualifies,
      points: pointsEarned,
    })
    // Four years of daily practice before this matters, and trimming only ever
    // costs detail, never the totals, because they are baselined below.
    if (p.log.length > 3000) {
      var dropped = p.log.shift()
      p.baseline.sets += 1
      p.baseline.problems += dropped.count
      p.baseline.correct += dropped.firstTry
      p.baseline.ms += dropped.ms
      p.baseline.stars += dropped.stars
      if (dropped.firstTry === dropped.count) p.baseline.perfectSets += 1
    }

    p.totals.sets++
    p.totals.problems += res.count
    p.totals.correct += res.firstTry
    p.totals.ms += res.ms
    p.totals.stars += stars
    if (accuracy === 1) p.totals.perfectSets++
    p.totals.bestCombo = Math.max(p.totals.bestCombo, res.bestCombo || 0)

    var goal = p.settings.dayGoal || 5
    var d =
      p.days[today()] ||
      (p.days[today()] = { sets: 0, problems: 0, correct: 0, ms: 0, good: 0, points: 0, goal: goal })
    d.sets++
    d.problems += res.count
    d.correct += res.firstTry
    d.ms += res.ms
    d.goal = goal
    if (qualifies) d.good = (d.good || 0) + 1
    var pointsBefore = d.points || 0
    d.points = pointsBefore + pointsEarned
    var dayDone = d.points >= goal

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
      // Today's tally, which a broken run adds to rather than costing.
      good: qualifies,
      pointsEarned: pointsEarned,
      bonusPoints: bonusPoints,
      lostRun: qualifies ? 0 : runBefore,
      dayGood: d.good || 0,
      dayPoints: d.points,
      dayGoal: goal,
      dayDone: dayDone,
      dayJustDone: dayDone && pointsBefore < goal,
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
    theme: function () {
      return KM.theme(profile().theme)
    },
    profiles: function () {
      return load().profiles
    },
    setActive: function (id) {
      load().activeId = id
      save()
    },
    addProfile: function (name, avatar, theme) {
      var p = newProfile(name, avatar, theme)
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
      if (!s.profiles.length) s.profiles.push(newProfile('Ara', '🦜', 'jungle'))
      if (s.activeId === id) s.activeId = s.profiles[0].id
      save()
    },
    newProfile: newProfile,
    stageRecord: stageRecord,
    recordProblem: recordProblem,
    recordSet: recordSet,
    // What today looks like so far.
    dayProgress: function (p) {
      var d = (p.days || {})[today()] || {}
      var goal = p.settings.dayGoal || 5
      return {
        points: d.points || 0,
        good: d.good || 0,
        sets: d.sets || 0,
        goal: goal,
        done: (d.points || 0) >= goal,
      }
    },
    trickyFacts: trickyFacts,
    recentDays: recentDays,
    levelProgress: levelProgress,
    today: today,
    // Used by sync: swap in a merged savefile and write it down.
    replace: function (next) {
      if (!looksValid(next)) return false
      state = next
      state.profiles.forEach(function (x) {
        if (!x.settings) x.settings = Object.assign({}, DEFAULT_SETTINGS)
      })
      if (!state.profiles.some(function (x) { return x.id === state.activeId })) {
        state.activeId = state.profiles[0].id
      }
      save()
      return true
    },
    reset: function () {
      state = fresh()
      clearSession()
      save()
    },
  }
})(typeof globalThis !== 'undefined' ? globalThis : this)
