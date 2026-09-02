/*
 * badges.js — the trophy cabinet.
 *
 * Each badge is a pure test against the profile, so awarding is just "run all
 * the tests after a set and see which ones newly pass". That means a badge can
 * never be missed by a bug in the place it was supposed to be handed out.
 */
;(function (root) {
  var KM = (root.KM = root.KM || {})

  function mastered(p) {
    return Object.keys(p.stages).filter(function (k) {
      return p.stages[k].mastered
    }).length
  }
  function levelDone(p, id) {
    return KM.store.levelProgress(p, id).pct === 1
  }
  function minutes(p) {
    return p.totals.ms / 60000
  }
  // Days where she reached that day's goal of good sets.
  function daysFinished(p) {
    var days = p.days || {}
    return Object.keys(days).filter(function (k) {
      var d = days[k]
      return (d.points || d.good || 0) >= (d.goal || 5)
    }).length
  }

  // ctx (present right after a set) = { accuracy, perProblem, stars, mastered, levelledUp, count, bestCombo, isBestTime }
  KM.BADGES = [
    { id: 'first-set', icon: '🌱', name: 'First Steps', hint: 'Finish your very first set', test: function (p) { return p.totals.sets >= 1 } },
    { id: 'sets-10', icon: '🎒', name: 'Ten Sets', hint: 'Finish 10 sets', test: function (p) { return p.totals.sets >= 10 } },
    { id: 'sets-50', icon: '🗺️', name: 'Fifty Sets', hint: 'Finish 50 sets', test: function (p) { return p.totals.sets >= 50 } },
    { id: 'sets-100', icon: '🏕️', name: 'Hundred Sets', hint: 'Finish 100 sets', test: function (p) { return p.totals.sets >= 100 } },
    { id: 'problems-100', icon: '💯', name: '100 Problems', hint: 'Answer 100 problems', test: function (p) { return p.totals.problems >= 100 } },
    { id: 'problems-500', icon: '🔢', name: '500 Problems', hint: 'Answer 500 problems', test: function (p) { return p.totals.problems >= 500 } },
    { id: 'problems-1000', icon: '🧠', name: 'Thousand Club', hint: 'Answer 1000 problems', test: function (p) { return p.totals.problems >= 1000 } },
    { id: 'perfect', icon: '✨', name: 'Perfect Set', hint: 'A whole set, all right first try', test: function (p) { return p.totals.perfectSets >= 1 } },
    { id: 'perfect-5', icon: '🌟', name: 'Five Perfects', hint: '5 perfect sets', test: function (p) { return p.totals.perfectSets >= 5 } },
    { id: 'perfect-25', icon: '👑', name: 'Perfect Queen', hint: '25 perfect sets', test: function (p) { return p.totals.perfectSets >= 25 } },
    { id: 'three-star', icon: '⭐', name: 'Three Stars', hint: 'Earn 3 stars in one set', test: function (p, c) { return (c && c.stars === 3) || p.totals.stars >= 3 } },
    { id: 'stars-50', icon: '🌠', name: 'Star Collector', hint: 'Collect 50 stars', test: function (p) { return p.totals.stars >= 50 } },
    { id: 'stars-150', icon: '🌌', name: 'Star Hoarder', hint: 'Collect 150 stars', test: function (p) { return p.totals.stars >= 150 } },
    { id: 'quick', icon: '⚡', name: 'Quick Thinker', hint: 'Average under 3 seconds a problem', test: function (p, c) { return c && c.perProblem <= 3 } },
    { id: 'lightning', icon: '🌩️', name: 'Lightning', hint: 'Average under 2 seconds a problem', test: function (p, c) { return c && c.perProblem <= 2 } },
    { id: 'combo-10', icon: '🔥', name: 'On Fire', hint: '10 right in a row', test: function (p) { return p.totals.bestCombo >= 10 } },
    { id: 'combo-25', icon: '☄️', name: 'Unstoppable', hint: '25 right in a row', test: function (p) { return p.totals.bestCombo >= 25 } },
    { id: 'best-time', icon: '⏱️', name: 'New Record', hint: 'Beat your own best time on a stage', test: function (p, c) { return c && c.isBestTime } },
    { id: 'stage-1', icon: '🎯', name: 'Stage Master', hint: 'Master your first stage', test: function (p) { return mastered(p) >= 1 } },
    { id: 'stage-5', icon: '🏅', name: 'Five Stages', hint: 'Master 5 stages', test: function (p) { return mastered(p) >= 5 } },
    { id: 'stage-15', icon: '🎖️', name: 'Fifteen Stages', hint: 'Master 15 stages', test: function (p) { return mastered(p) >= 15 } },
    { id: 'day-1', icon: '🌅', name: 'Day Done', hint: 'Finish a whole day of good sets', test: function (p) { return daysFinished(p) >= 1 } },
    { id: 'day-5', icon: '🌇', name: 'Five Days Done', hint: 'Finish 5 days of good sets', test: function (p) { return daysFinished(p) >= 5 } },
    { id: 'day-20', icon: '🌄', name: 'Twenty Days Done', hint: 'Finish 20 days of good sets', test: function (p) { return daysFinished(p) >= 20 } },
    { id: 'streak-3', icon: '📅', name: 'Three Days', hint: 'Practise 3 days in a row', test: function (p) { return p.streak.best >= 3 } },
    { id: 'streak-7', icon: '🗓️', name: 'Whole Week', hint: 'Practise 7 days in a row', test: function (p) { return p.streak.best >= 7 } },
    { id: 'streak-30', icon: '🏆', name: 'Whole Month', hint: 'Practise 30 days in a row', test: function (p) { return p.streak.best >= 30 } },
    { id: 'level-3A', icon: '🌿', name: 'Forest Floor', hint: 'Master every stage in Level 3A', test: function (p) { return levelDone(p, '3A') } },
    { id: 'level-2A', icon: '🌴', name: 'Understory', hint: 'Master every stage in Level 2A', test: function (p) { return levelDone(p, '2A') } },
    { id: 'level-A', icon: '🍃', name: 'The Canopy', hint: 'Master every stage in Level A', test: function (p) { return levelDone(p, 'A') } },
    { id: 'level-B', icon: '🌺', name: 'Treetops', hint: 'Master every stage in Level B', test: function (p) { return levelDone(p, 'B') } },
    { id: 'level-C', icon: '☀️', name: 'Open Sky', hint: 'Master every stage in Level C', test: function (p) { return levelDone(p, 'C') } },
    { id: 'time-60', icon: '⌛', name: 'An Hour In', hint: 'One hour of practice altogether', test: function (p) { return minutes(p) >= 60 } },
    { id: 'time-300', icon: '🔭', name: 'Five Hours', hint: 'Five hours of practice altogether', test: function (p) { return minutes(p) >= 300 } },
    { id: 'comeback', icon: '💪', name: 'Comeback', hint: 'Turn a tricky fact into a quick one', test: function (p, c) { return c && c.fixedTricky } },
  ]

  // Returns the badges newly earned, and stamps them on the profile.
  KM.awardBadges = function (p, ctx) {
    var won = []
    KM.BADGES.forEach(function (b) {
      if (p.badges[b.id]) return
      var ok = false
      try {
        ok = !!b.test(p, ctx)
      } catch (e) {
        ok = false
      }
      if (ok) {
        p.badges[b.id] = Date.now()
        won.push(b)
      }
    })
    return won
  }

  KM.badge = function (id) {
    for (var i = 0; i < KM.BADGES.length; i++) if (KM.BADGES[i].id === id) return KM.BADGES[i]
    return null
  }
})(typeof globalThis !== 'undefined' ? globalThis : this)
