/*
 * engine.js — building a set, timing it, and scoring it.
 *
 * A "set" is ten problems (five or twenty if you prefer). Most come fresh from
 * the current stage's generator; a few are deliberately dragged back in from
 * the facts she has been slow or wrong on, so revision happens without her
 * ever being sent back to an easier screen.
 */
;(function (root) {
  var KM = (root.KM = root.KM || {})

  function parseFact(key) {
    var m = /^(\d+)([+\-*/])(\d+)$/.exec(key)
    if (!m) return null
    var a = parseInt(m[1], 10)
    var b = parseInt(m[3], 10)
    var op = m[2]
    var answer = op === '+' ? a + b : op === '-' ? a - b : op === '*' ? a * b : b === 0 ? null : a / b
    if (answer === null || answer < 0 || answer % 1 !== 0) return null
    return { a: a, b: b, op: op, answer: answer, revision: true }
  }

  // What can this branch actually throw at her? Learned by sampling its own
  // generator, so it stays true as the curriculum changes.
  var profiles = {}
  function stageProfile(stage) {
    if (profiles[stage.id]) return profiles[stage.id]
    var prof = { ops: {}, maxA: 0, maxB: 0, maxAnswer: 0 }
    for (var i = 0; i < 150; i++) {
      var p = stage.gen()
      prof.ops[p.op] = true
      prof.maxA = Math.max(prof.maxA, p.a)
      prof.maxB = Math.max(prof.maxB, p.b)
      prof.maxAnswer = Math.max(prof.maxAnswer, p.answer)
    }
    profiles[stage.id] = prof
    return prof
  }

  // Sampling can under-estimate a generator's reach, so every real problem it
  // produces widens the profile.
  function widenProfile(stage, p) {
    var prof = stageProfile(stage)
    prof.ops[p.op] = true
    prof.maxA = Math.max(prof.maxA, p.a)
    prof.maxB = Math.max(prof.maxB, p.b)
    prof.maxAnswer = Math.max(prof.maxAnswer, p.answer)
  }

  // Revision must never be harder than the branch she chose. Dropping "18 + 6"
  // into "Add 1" is exactly the thing that makes a child distrust the easy
  // branch she went to for a confidence boost.
  function fitsStage(prob, stage) {
    var prof = stageProfile(stage)
    return (
      !!prof.ops[prob.op] &&
      prob.a <= prof.maxA &&
      prob.b <= prof.maxB &&
      prob.answer <= prof.maxAnswer
    )
  }

  function sameProblem(x, y) {
    return x && y && x.a === y.a && x.b === y.b && x.op === y.op
  }

  function buildSet(p, stageId, size) {
    var stage = KM.stage(stageId) || KM.stage(KM.DEFAULT_STAGE)
    size = size || 10
    var out = []

    // Up to a third of the set is revision, and only if there is anything
    // genuinely worth revising.
    var tricky = KM.store.trickyFacts(p, 30)
    var wanted = Math.floor(size / 3)
    var revision = []
    for (var i = 0; i < tricky.length && revision.length < wanted; i++) {
      var prob = parseFact(tricky[i].key)
      if (prob && fitsStage(prob, stage)) revision.push(prob)
    }

    // Most branches have a small, finite pool — "sums up to 24" is 45 problems,
    // "add 1" is nine. Picking at random means the same dozen keep coming up
    // and a repeat set feels like a fixed list. So for each slot we generate a
    // handful of candidates and take the one she has practised least recently,
    // which walks the whole pool before coming back round.
    var fresh = []
    var usedInSet = {}
    for (var n = 0; n < size - revision.length; n++) {
      var best = null
      var bestScore = null
      for (var t = 0; t < 14; t++) {
        var candidate = stage.gen()
        widenProfile(stage, candidate)
        var key = KM.factKey(candidate)
        var fact = p.facts[key]
        // Rank by how many times it is already in THIS set, then by how long
        // ago she last met it. Never practised counts as time zero, so new
        // facts come first and a pool smaller than the set spreads its
        // unavoidable repeats evenly instead of clumping them.
        var score = [usedInSet[key] || 0, fact ? fact.lastAt || 0 : 0]
        if (!bestScore || score[0] < bestScore[0] || (score[0] === bestScore[0] && score[1] < bestScore[1])) {
          best = candidate
          bestScore = score
        }
        if (score[0] === 0 && score[1] === 0) break // can't do better than never met
      }
      usedInSet[KM.factKey(best)] = (usedInSet[KM.factKey(best)] || 0) + 1
      fresh.push(best)
    }

    // Shuffle revision into the middle: never first (a cold start on your
    // worst fact is discouraging) and never last (we want to finish strong).
    out = fresh.slice()
    revision.forEach(function (r) {
      var lo = 1
      var hi = Math.max(lo, out.length - 1)
      out.splice(lo + Math.floor(KM.rng() * (hi - lo + 1)), 0, r)
    })
    return { stageId: stage.id, problems: out.slice(0, size) }
  }

  // One star per thing achieved, so a child can always see which one she
  // missed and why:
  //   ⭐ finished the set
  //   ⭐ got at least 9 of 10 right first try
  //   ⭐ was quick — inside the branch target, OR faster than her own best
  //
  // Beating her own best always counts, so the speed star stays reachable on
  // the day she is still twice the target. Mastery still needs the real
  // target, so the ladder does not get easier.
  // Compare at the precision she is shown, never below it: 3.14 and 3.09 both
  // read as "3.1", so calling one of them an improvement is a lie.
  function tenth(x) {
    return Math.round(x * 10) / 10
  }

  function stars(accuracy, perProblem, target, bestPerProblem) {
    // Matching her best counts as quick — she held the pace, and no child
    // should lose a star to the second decimal place.
    var quick =
      perProblem <= target || (bestPerProblem > 0 && tenth(perProblem) <= tenth(bestPerProblem))
    return 1 + (accuracy >= 0.9 ? 1 : 0) + (quick ? 1 : 0)
  }

  function start(p, stageId, size) {
    var built = buildSet(p, stageId, size || p.settings.setSize)
    var trickyAtStart = {}
    KM.store.trickyFacts(p, 20).forEach(function (t) {
      trickyAtStart[t.key] = true
    })
    return {
      stageId: built.stageId,
      problems: built.problems,
      i: 0,
      tries: 0,
      combo: 0,
      bestCombo: 0,
      firstTry: 0,
      answered: 0,
      revealed: false,
      log: [],
      thinkMs: 0, // time spent actually thinking, celebrations excluded
      trickyAtStart: trickyAtStart,
      fixedTricky: false,
      startedAt: Date.now(),
      shownAt: Date.now(),
      finishedAt: null,
    }
  }

  // Everything needed to pick a half-finished set back up. Written after every
  // answer, so the worst an app switch or a crash can cost her is the problem
  // she was looking at.
  function snapshot(s) {
    return {
      profileId: KM.store.profile().id,
      stageId: s.stageId,
      problems: s.problems,
      i: s.i,
      combo: s.combo,
      bestCombo: s.bestCombo,
      firstTry: s.firstTry,
      answered: s.answered,
      log: s.log,
      thinkMs: s.thinkMs,
      trickyAtStart: s.trickyAtStart,
      fixedTricky: s.fixedTricky,
      savedAt: Date.now(),
    }
  }

  function resume(snap) {
    return {
      stageId: snap.stageId,
      problems: snap.problems,
      i: snap.i,
      tries: 0,
      combo: snap.combo || 0,
      bestCombo: snap.bestCombo || 0,
      firstTry: snap.firstTry || 0,
      answered: snap.answered || 0,
      revealed: false,
      log: snap.log || [],
      thinkMs: snap.thinkMs || 0,
      trickyAtStart: snap.trickyAtStart || {},
      fixedTricky: !!snap.fixedTricky,
      startedAt: Date.now(),
      shownAt: Date.now(),
      finishedAt: null,
      resumed: true,
    }
  }

  function current(s) {
    return s.problems[s.i] || null
  }
  function expectedDigits(s) {
    var p = current(s)
    return p ? String(p.answer).length : 1
  }

  // The heart of it. Returns what the UI should celebrate or shrug at.
  function submit(s, value) {
    var prob = current(s)
    if (!prob || s.finishedAt) return { ignored: true }
    var ms = Date.now() - s.shownAt
    var right = Number(value) === prob.answer
    s.tries++

    if (!right) {
      s.combo = 0
      return {
        correct: false,
        answer: prob.answer,
        tries: s.tries,
        // Two goes, then we show her the answer to copy rather than let her
        // stall on it. Copying it in still counts as practice.
        reveal: s.tries >= 2,
      }
    }

    var firstTry = s.tries === 1
    if (firstTry) {
      s.firstTry++
      s.combo++
      s.bestCombo = Math.max(s.bestCombo, s.combo)
    } else {
      s.combo = 0
    }
    s.answered++

    var stage = KM.stage(s.stageId)
    var key = KM.factKey(prob)
    if (firstTry && s.trickyAtStart[key] && ms <= stage.target * 1200) s.fixedTricky = true

    // The clock on a problem runs from it appearing to the right answer, so
    // wrong goes are included but the confetti between problems is not. That
    // is the number mastery is judged on — otherwise the celebration she just
    // earned would count against her next one.
    s.thinkMs += ms
    KM.store.recordProblem(KM.store.profile(), prob, ms, firstTry)
    // Write it down now. Everything else in this file can be recomputed; the
    // fact that she answered this problem cannot.
    KM.store.save()
    s.log.push({ key: key, ms: ms, firstTry: firstTry, revision: !!prob.revision })

    s.i++
    s.tries = 0
    s.shownAt = Date.now()
    var done = s.i >= s.problems.length
    if (done) s.finishedAt = Date.now()
    if (done) KM.store.clearSession()
    else KM.store.saveSession(snapshot(s))

    return {
      correct: true,
      firstTry: firstTry,
      combo: s.combo,
      ms: ms,
      quick: ms <= stage.target * 1000,
      done: done,
      index: s.i,
      total: s.problems.length,
    }
  }

  // Wrap the set up: write it to the profile, hand back everything the results
  // screen wants to show.
  function finish(s) {
    var p = KM.store.profile()
    var stage = KM.stage(s.stageId)
    var count = s.problems.length
    var ms = s.thinkMs || (s.finishedAt || Date.now()) - s.startedAt
    var wallMs = (s.finishedAt || Date.now()) - s.startedAt
    var accuracy = count ? s.firstTry / count : 0
    var perProblem = count ? ms / count / 1000 : 999
    // Read her previous best before recording this set, or she would be
    // competing against the set she just finished.
    var record = KM.store.stageRecord(p, s.stageId)
    var previousBest = record.bestPerProblem || 0
    var previousTime = record.lastPerProblem || 0
    var previousHistory = (record.history || []).slice()
    var st = stars(accuracy, perProblem, stage.target, previousBest)

    var res = KM.store.recordSet(p, {
      stageId: s.stageId,
      count: count,
      firstTry: s.firstTry,
      ms: ms,
      stars: st,
      bestCombo: s.bestCombo,
    })
    res.count = count
    res.ms = ms
    res.wallMs = wallMs
    res.previousBest = previousBest
    res.previousTime = previousTime
    // Everything below is judged on the rounded numbers the results screen
    // actually prints, so the banner, the chip and the stars cannot disagree.
    var shown = tenth(perProblem)
    var shownPrevious = tenth(previousTime)
    var shownBest = tenth(previousBest)
    res.shown = shown
    res.shownPrevious = shownPrevious
    res.beatOwnBest = shownBest > 0 && shown < shownBest
    res.matchedOwnBest = shownBest > 0 && shown === shownBest
    // Positive means she visibly shaved this much off her last go.
    res.improvedBy = shownPrevious > 0 ? tenth(shownPrevious - shown) : 0
    res.history = previousHistory.concat([Math.round(perProblem * 10) / 10])
    res.target = stage.target
    res.quickAnswers = s.log.filter(function (x) {
      return x.firstTry && x.ms <= stage.target * 1000
    }).length
    res.bestCombo = s.bestCombo
    res.fixedTricky = s.fixedTricky
    res.stageId = s.stageId
    res.slowest = s.log
      .slice()
      .sort(function (a, b) {
        return b.ms - a.ms
      })
      .slice(0, 3)

    res.badges = KM.awardBadges(p, res)
    KM.store.clearSession()
    KM.store.save()
    return res
  }

  KM.engine = {
    buildSet: buildSet,
    fitsStage: fitsStage,
    stageProfile: stageProfile,
    snapshot: snapshot,
    resume: resume,
    parseFact: parseFact,
    stars: stars,
    start: start,
    current: current,
    expectedDigits: expectedDigits,
    submit: submit,
    finish: finish,
  }
})(typeof globalThis !== 'undefined' ? globalThis : this)
