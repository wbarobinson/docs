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

  function sameProblem(x, y) {
    return x && y && x.a === y.a && x.b === y.b && x.op === y.op
  }

  function buildSet(p, stageId, size) {
    var stage = KM.stage(stageId) || KM.stage(KM.DEFAULT_STAGE)
    size = size || 10
    var out = []

    // Up to a third of the set is revision, and only if there is anything
    // genuinely worth revising.
    var tricky = KM.store.trickyFacts(p, 20)
    var wanted = Math.min(Math.floor(size / 3), tricky.length)
    var revision = []
    for (var i = 0; i < tricky.length && revision.length < wanted; i++) {
      var prob = parseFact(tricky[i].key)
      if (prob) revision.push(prob)
    }

    var fresh = []
    for (var n = 0; n < size - revision.length; n++) {
      // Try a few times for a problem we have not already got in this set;
      // small stages (like "friends of 10") legitimately run out of options.
      var candidate = null
      for (var t = 0; t < 12; t++) {
        candidate = stage.gen()
        var dup = fresh.some(function (x) {
          return sameProblem(x, candidate)
        })
        if (!dup) break
      }
      fresh.push(candidate)
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

  function stars(accuracy, perProblem, target) {
    var r = perProblem / target
    if (accuracy >= 0.95 && r <= 1) return 3
    if (accuracy >= 0.8 && r <= 1.5) return 2
    return 1
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
    s.log.push({ key: key, ms: ms, firstTry: firstTry, revision: !!prob.revision })

    s.i++
    s.tries = 0
    s.shownAt = Date.now()
    var done = s.i >= s.problems.length
    if (done) s.finishedAt = Date.now()

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
    var st = stars(accuracy, perProblem, stage.target)

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
    KM.store.save()
    return res
  }

  KM.engine = {
    buildSet: buildSet,
    parseFact: parseFact,
    stars: stars,
    start: start,
    current: current,
    expectedDigits: expectedDigits,
    submit: submit,
    finish: finish,
  }
})(typeof globalThis !== 'undefined' ? globalThis : this)
