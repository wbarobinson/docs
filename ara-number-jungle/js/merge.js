/*
 * merge.js — combining two copies of the same family's progress.
 *
 * Both children might practise on the iPad and the laptop in the same evening.
 * Neither copy is "right", so we never pick a winner wholesale: we take the
 * better of each individual number. The rule throughout is "progress only ever
 * goes up" — a merge can never lose a set, a badge or a mastered branch.
 *
 * Pure and deterministic: merge(a, b) and merge(b, a) agree.
 */
;(function (root) {
  var KM = (root.KM = root.KM || {})

  function maxOf(a, b) {
    return (a || 0) > (b || 0) ? a || 0 : b || 0
  }
  function minDefined(a, b) {
    if (a == null) return b == null ? null : b
    if (b == null) return a
    return Math.min(a, b)
  }
  function newer(a, b) {
    return (a.savedAt || 0) >= (b.savedAt || 0) ? a : b
  }

  function mergeFacts(a, b) {
    var out = {}
    Object.keys(a || {}).forEach(function (k) {
      out[k] = a[k]
    })
    Object.keys(b || {}).forEach(function (k) {
      var mine = out[k]
      var theirs = b[k]
      if (!mine) {
        out[k] = theirs
        return
      }
      out[k] = {
        n: maxOf(mine.n, theirs.n),
        wrong: maxOf(mine.wrong, theirs.wrong),
        // The more recent attempt describes her best; keep that one's timing.
        ms: (mine.lastAt || 0) >= (theirs.lastAt || 0) ? mine.ms : theirs.ms,
        lastMs: (mine.lastAt || 0) >= (theirs.lastAt || 0) ? mine.lastMs : theirs.lastMs,
        lastAt: maxOf(mine.lastAt, theirs.lastAt),
      }
    })
    return out
  }

  function mergeStages(a, b) {
    var out = {}
    var ids = {}
    Object.keys(a || {}).forEach(function (k) {
      ids[k] = true
    })
    Object.keys(b || {}).forEach(function (k) {
      ids[k] = true
    })
    Object.keys(ids).forEach(function (id) {
      var x = (a || {})[id]
      var y = (b || {})[id]
      if (!x || !y) {
        out[id] = x || y
        return
      }
      var xNewer = (x.lastAt || 0) >= (y.lastAt || 0)
      var fresher = xNewer ? x : y
      out[id] = {
        sets: maxOf(x.sets, y.sets),
        problems: maxOf(x.problems, y.problems),
        correct: maxOf(x.correct, y.correct),
        bestMs: minDefined(x.bestMs, y.bestMs),
        bestPerProblem: minDefined(x.bestPerProblem, y.bestPerProblem) || null,
        lastPerProblem: fresher.lastPerProblem || null,
        // Keep the longer history, and prefer the fresher one when tied.
        history: (x.history || []).length >= (y.history || []).length ? x.history || [] : y.history || [],
        bestScore: maxOf(x.bestScore, y.bestScore),
        stars: maxOf(x.stars, y.stars),
        // Mastery is never taken away.
        mastered: !!(x.mastered || y.mastered),
        // A run is a claim about consecutive sets on one device; the fresher
        // device is the only one that can speak to it.
        run: fresher.run || 0,
        lastAt: maxOf(x.lastAt, y.lastAt),
      }
    })
    return out
  }

  function mergeDays(a, b) {
    var out = {}
    var keys = {}
    Object.keys(a || {}).forEach(function (k) {
      keys[k] = true
    })
    Object.keys(b || {}).forEach(function (k) {
      keys[k] = true
    })
    Object.keys(keys).forEach(function (day) {
      var x = (a || {})[day] || {}
      var y = (b || {})[day] || {}
      out[day] = {
        sets: maxOf(x.sets, y.sets),
        problems: maxOf(x.problems, y.problems),
        correct: maxOf(x.correct, y.correct),
        ms: maxOf(x.ms, y.ms),
        good: maxOf(x.good, y.good),
        points: maxOf(x.points, y.points),
        goal: maxOf(x.goal, y.goal) || 5,
      }
    })
    return out
  }

  function mergeBadges(a, b) {
    var out = {}
    Object.keys(a || {}).forEach(function (k) {
      out[k] = a[k]
    })
    Object.keys(b || {}).forEach(function (k) {
      // Earned once, earned forever, and the first time is the true one.
      out[k] = out[k] ? Math.min(out[k], b[k]) : b[k]
    })
    return out
  }

  // Union by entry id: idempotent, so syncing the same set twice cannot count
  // it twice, and commutative, so device order does not matter.
  function mergeLogs(a, b) {
    var seen = {}
    var out = []
    ;(a || []).concat(b || []).forEach(function (e) {
      if (!e || !e.id || seen[e.id]) return
      seen[e.id] = true
      out.push(e)
    })
    out.sort(function (m, n) {
      return (m.at || 0) - (n.at || 0)
    })
    return out
  }

  // Everything countable, rebuilt from the baseline plus the merged log.
  function derive(baseline, log) {
    var totals = {
      sets: baseline.sets || 0,
      problems: baseline.problems || 0,
      correct: baseline.correct || 0,
      ms: baseline.ms || 0,
      stars: baseline.stars || 0,
      perfectSets: baseline.perfectSets || 0,
      bestCombo: 0,
    }
    var days = {}
    log.forEach(function (e) {
      totals.sets++
      totals.problems += e.count || 0
      totals.correct += e.firstTry || 0
      totals.ms += e.ms || 0
      totals.stars += e.stars || 0
      if (e.count && e.firstTry === e.count) totals.perfectSets++
      var d =
        days[e.day] || (days[e.day] = { sets: 0, problems: 0, correct: 0, ms: 0, good: 0, points: 0 })
      d.sets++
      d.problems += e.count || 0
      d.correct += e.firstTry || 0
      d.ms += e.ms || 0
      if (e.good) d.good++
      // Sets logged before points existed are worth the one they earned.
      d.points += e.points == null ? 1 : e.points
    })
    return { totals: totals, days: days }
  }

  function mergeProfile(x, y) {
    var fresher = newer(x, y)
    var log = mergeLogs(x.log, y.log)
    // Both baselines describe the same pre-log history, so the larger is the
    // true one.
    var baseline = {
      sets: maxOf(x.baseline && x.baseline.sets, y.baseline && y.baseline.sets),
      problems: maxOf(x.baseline && x.baseline.problems, y.baseline && y.baseline.problems),
      correct: maxOf(x.baseline && x.baseline.correct, y.baseline && y.baseline.correct),
      ms: maxOf(x.baseline && x.baseline.ms, y.baseline && y.baseline.ms),
      stars: maxOf(x.baseline && x.baseline.stars, y.baseline && y.baseline.stars),
      perfectSets: maxOf(x.baseline && x.baseline.perfectSets, y.baseline && y.baseline.perfectSets),
    }
    var derived = derive(baseline, log)
    var furthest =
      KM.stageIndex(x.stageId || '') >= KM.stageIndex(y.stageId || '') ? x.stageId : y.stageId
    var unlocked =
      KM.stageIndex(x.unlockedTo || '') >= KM.stageIndex(y.unlockedTo || '') ? x.unlockedTo : y.unlockedTo
    return {
      id: x.id,
      name: fresher.name,
      avatar: fresher.avatar,
      theme: fresher.theme,
      createdAt: Math.min(x.createdAt || 0, y.createdAt || 0) || fresher.createdAt,
      savedAt: maxOf(x.savedAt, y.savedAt),
      settings: fresher.settings,
      settingsVersion: maxOf(x.settingsVersion, y.settingsVersion),
      stageId: furthest,
      unlockedTo: unlocked,
      log: log,
      baseline: baseline,
      stages: mergeStages(x.stages, y.stages),
      facts: mergeFacts(x.facts, y.facts),
      badges: mergeBadges(x.badges, y.badges),
      // Days and totals come from the log, falling back to whichever copy
      // remembers more for the days that predate logging.
      days: mergeDays(mergeDays(x.days, y.days), derived.days),
      streak: {
        current: maxOf(x.streak && x.streak.current, y.streak && y.streak.current),
        best: maxOf(x.streak && x.streak.best, y.streak && y.streak.best),
        lastDay:
          (x.streak && x.streak.lastDay) > (y.streak && y.streak.lastDay)
            ? x.streak.lastDay
            : (y.streak && y.streak.lastDay) || (x.streak && x.streak.lastDay) || null,
      },
      totals: {
        sets: derived.totals.sets,
        problems: derived.totals.problems,
        correct: derived.totals.correct,
        ms: derived.totals.ms,
        stars: derived.totals.stars,
        perfectSets: derived.totals.perfectSets,
        // Never recorded per set, so the best either device saw stands.
        bestCombo: maxOf(x.totals && x.totals.bestCombo, y.totals && y.totals.bestCombo),
      },
    }
  }

  // Two whole savefiles in, one out.
  function merge(a, b) {
    if (!a) return b
    if (!b) return a
    var byId = {}
    ;(a.profiles || []).forEach(function (p) {
      byId[p.id] = p
    })
    var profiles = []
    ;(a.profiles || []).forEach(function (p) {
      profiles.push(p)
    })
    ;(b.profiles || []).forEach(function (p) {
      if (!byId[p.id]) {
        profiles.push(p)
        return
      }
      // Same child on both sides: combine, in place.
      var at = profiles.indexOf(byId[p.id])
      profiles[at] = mergeProfile(byId[p.id], p)
    })
    var fresher = newer(a, b)
    return {
      version: 1,
      savedAt: maxOf(a.savedAt, b.savedAt),
      activeId: fresher.activeId,
      seededJon: !!(a.seededJon || b.seededJon),
      profiles: profiles,
    }
  }

  KM.merge = merge
  KM.mergeProfile = mergeProfile
  if (typeof module !== 'undefined' && module.exports) module.exports = { merge: merge, mergeProfile: mergeProfile }
})(typeof globalThis !== 'undefined' ? globalThis : this)
