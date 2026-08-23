/*
 * curriculum.js — the whole ladder, from "add 1" to "times tables and sharing".
 *
 * Modelled on the shape of a Kumon maths ladder rather than copied from it:
 * many narrow steps, ten-problem sets, and you only move up when you are both
 * accurate AND quick. Each stage owns its own problem generator so the numbers
 * a stage can produce are defined in exactly one place.
 */
;(function (root) {
  var KM = (root.KM = root.KM || {})

  // Swappable so the self-test can run every generator with a seeded rng.
  KM.rng = function () {
    return Math.random()
  }

  function ri(lo, hi) {
    return lo + Math.floor(KM.rng() * (hi - lo + 1))
  }
  function pick(list) {
    return list[Math.floor(KM.rng() * list.length)]
  }
  function tens(n) {
    return Math.floor(n / 10)
  }

  // Rejection sampling: try `make` until `ok` is happy, then give up gracefully
  // so a too-tight constraint can never hang the app on a child's iPad.
  function until(make, ok) {
    for (var i = 0; i < 200; i++) {
      var p = make()
      if (!ok || ok(p)) return p
    }
    return make()
  }

  function add(a, b) {
    return { a: a, b: b, op: '+', answer: a + b }
  }
  function sub(a, b) {
    return { a: a, b: b, op: '-', answer: a - b }
  }
  function mul(a, b) {
    return { a: a, b: b, op: '*', answer: a * b }
  }
  function div(a, b) {
    return { a: a * b, b: b, op: '/', answer: a }
  }

  // --- generator builders ------------------------------------------------

  // Add one of `bs` to a number in [lo, hi].
  function addFixed(bs, lo, hi, ok) {
    return function () {
      return until(function () {
        return add(ri(lo, hi), pick(bs))
      }, ok)
    }
  }
  function addRange(alo, ahi, blo, bhi, ok) {
    return function () {
      return until(function () {
        return add(ri(alo, ahi), ri(blo, bhi))
      }, ok)
    }
  }
  // "Up to sum of 24" — pick the answer first, then split it. This is how the
  // Kumon addition sections are actually bounded: by the ceiling the sum
  // reaches, not by which number is being added.
  function sumBand(lo, hi, blo, bhi, amin) {
    return function () {
      return until(
        function () {
          var answer = ri(lo, hi)
          var b = ri(blo, bhi)
          return add(answer - b, b)
        },
        function (p) {
          return p.a >= (amin == null ? 1 : amin) && p.answer >= lo && p.answer <= hi
        },
      )
    }
  }

  function subRange(alo, ahi, blo, bhi, ok) {
    return function () {
      return until(function () {
        return sub(ri(alo, ahi), ri(blo, bhi))
      }, ok)
    }
  }

  var crossesTen = function (p) {
    return p.a % 10 !== 0 && tens(p.a + p.b) > tens(p.a)
  }
  var noCross = function (p) {
    return tens(p.a + p.b) === tens(p.a)
  }
  var borrows = function (p) {
    return p.a - p.b >= 0 && p.a % 10 < p.b % 10
  }
  var noBorrow = function (p) {
    return p.a - p.b >= 0 && p.a % 10 >= p.b % 10
  }
  var positive = function (p) {
    return p.answer >= 0
  }

  // --- levels -----------------------------------------------------------

  // Ara climbs the rainforest, one layer at a time: floor, understory,
  // canopy, the emergent treetops, then out into the open sky.
  KM.LEVELS = [
    { id: '3A', name: 'Level 3A', place: 'Forest Floor', blurb: 'Adding 1, 2 and 3', hue: 110, icon: '🌿' },
    { id: '2A', name: 'Level 2A', place: 'Understory', blurb: 'Adding up to 10', hue: 162, icon: '🌴' },
    { id: 'A', name: 'Level A', place: 'The Canopy', blurb: 'Sums up to 28, then taking away', hue: 42, icon: '🍃' },
    { id: 'B', name: 'Level B', place: 'Treetops', blurb: 'Two and three digit columns', hue: 6, icon: '🌺' },
    { id: 'C', name: 'Level C', place: 'Open Sky', blurb: 'Times tables & sharing', hue: 205, icon: '☀️' },
  ]

  // Each child gets their own world. The maths ladder underneath is identical;
  // only the names, the mascot, the decoration and the noises change.
  KM.THEMES = {
    jungle: {
      id: 'jungle',
      name: 'Number Jungle',
      mascot: '🦜',
      token: '🪶',
      mapTitle: '🗺️ Jungle map',
      decor: '🌴🌿🍃🌺🌴🌿🍃🌺🌴🌿🍃🌺🌴🌿🍃🌺🌴🌿🍃🌺',
      cheer: 'squawk',
      unit: 'branch',
      praise: ['Squawk!', 'Nice!', 'Yes!', 'Bravo!', 'Lovely!'],
      places: {
        '3A': { place: 'Forest Floor', icon: '🌿', hue: 110 },
        '2A': { place: 'Understory', icon: '🌴', hue: 162 },
        A: { place: 'The Canopy', icon: '🍃', hue: 42 },
        B: { place: 'Treetops', icon: '🌺', hue: 6 },
        C: { place: 'Open Sky', icon: '☀️', hue: 205 },
      },
    },
    dino: {
      id: 'dino',
      name: 'Dino Valley',
      mascot: '🦖',
      token: '🦴',
      mapTitle: '🗺️ Valley map',
      decor: '🦕🌿🦴🌋🥚🌴🦖🌿🦕🌋🦴🌴🥚🌿🦖🌋🦕🌿🦴🌴',
      cheer: 'roar',
      unit: 'ridge',
      praise: ['Roar!', 'Stomp!', 'Yes!', 'Mighty!', 'Huge!'],
      places: {
        '3A': { place: 'Fern Beds', icon: '🌿', hue: 96 },
        '2A': { place: 'Mud Swamp', icon: '🐊', hue: 150 },
        A: { place: 'Great Plains', icon: '🦕', hue: 34 },
        B: { place: 'Volcano Slopes', icon: '🌋', hue: 12 },
        C: { place: 'Comet Sky', icon: '☄️', hue: 262 },
      },
    },
  }

  KM.DEFAULT_THEME = 'jungle'

  KM.theme = function (id) {
    return KM.THEMES[id] || KM.THEMES[KM.DEFAULT_THEME]
  }

  // A level as this child sees it: the same maths, their world's name for it.
  KM.place = function (levelId, themeId) {
    var lv = KM.level(levelId) || {}
    var t = KM.theme(themeId).places[levelId]
    return {
      id: levelId,
      name: lv.name,
      blurb: lv.blurb,
      place: t ? t.place : lv.place,
      icon: t ? t.icon : lv.icon,
      hue: t ? t.hue : lv.hue,
    }
  }

  // target = seconds per problem she should beat to count a set as "quick".
  // Kumon-ish: the number gets tighter as the facts get more familiar, and
  // loosens again whenever a genuinely new idea (carrying, borrowing) arrives.
  KM.STAGES = [
    // ---- Level 3A: adding 1, 2 and 3 ----
    { id: '3A-1', level: '3A', name: 'Add 1', detail: 'Add 1 to numbers up to 9', target: 3.0, gen: addFixed([1], 1, 9) },
    { id: '3A-2', level: '3A', name: 'Add 2', detail: 'Add 2 to numbers up to 8', target: 3.0, gen: addFixed([2], 1, 8) },
    { id: '3A-3', level: '3A', name: 'Add 3', detail: 'Add 3 to numbers up to 7', target: 3.0, gen: addFixed([3], 1, 7) },
    { id: '3A-4', level: '3A', name: 'Add 1, 2 or 3', detail: 'Mixed, sums to 10', target: 3.0, gen: addFixed([1, 2, 3], 1, 7) },
    { id: '3A-5', level: '3A', name: 'Add 1, 2, 3 to teens', detail: 'Numbers 10 to 18', target: 3.2, gen: addFixed([1, 2, 3], 10, 18) },
    { id: '3A-6', level: '3A', name: 'Forest Floor mixed', detail: 'Adding 1, 2 and 3 to anything up to 18', target: 3.2, gen: addFixed([1, 2, 3], 1, 18) },

    // ---- Level 2A: adding up to 10 ----
    { id: '2A-1', level: '2A', name: 'Add 4 or 5', detail: 'Sums up to 10', target: 3.2, gen: addFixed([4, 5], 1, 5) },
    { id: '2A-2', level: '2A', name: 'Friends of 10', detail: 'Pairs that make exactly 10', target: 3.0, gen: function () { var a = ri(1, 9); return add(a, 10 - a) } },
    { id: '2A-3', level: '2A', name: 'Add 6 or 7', detail: 'Sums up to 10', target: 3.4, gen: addFixed([6, 7], 0, 4) },
    { id: '2A-4', level: '2A', name: 'Add 8, 9 or 10', detail: 'Sums up to 10', target: 3.4, gen: addFixed([8, 9, 10], 0, 2) },
    { id: '2A-5', level: '2A', name: 'Doubles', detail: '1+1 up to 5+5', target: 3.0, gen: function () { var a = ri(1, 5); return add(a, a) } },
    { id: '2A-6', level: '2A', name: 'All sums to 10', detail: 'Everything from the Understory, mixed', target: 3.0, gen: addRange(0, 9, 0, 9, function (p) { return p.answer <= 10 }) },

    // ---- Level A: horizontal addition by sum ceiling, then taking away ----
    // The ceilings (12, 15, 18, 20, 24, 28) follow how the Kumon addition
    // sections are bounded. Her branch is "sums up to 24".
    { id: 'A-1', level: 'A', name: 'Sums up to 12', detail: 'Adding a small number, total no more than 12', target: 3.4, gen: sumBand(8, 12, 1, 9, 2) },
    { id: 'A-2', level: 'A', name: 'Sums up to 15', detail: 'Adding a small number, total no more than 15', target: 3.6, gen: sumBand(11, 15, 1, 9, 4) },
    { id: 'A-3', level: 'A', name: 'Sums up to 18', detail: 'Adding a small number, total no more than 18', target: 3.8, gen: sumBand(14, 18, 1, 9, 7) },
    { id: 'A-4', level: 'A', name: 'Sums up to 20', detail: 'Adding a small number, total no more than 20', target: 3.8, gen: sumBand(17, 20, 1, 9, 9) },
    { id: 'A-5', level: 'A', name: 'Sums up to 24', detail: 'Adding a small number to numbers in the twenties', target: 4.0, gen: sumBand(20, 24, 1, 9, 11) },
    { id: 'A-6', level: 'A', name: 'Sums up to 28', detail: 'Adding a small number, total no more than 28', target: 4.0, gen: sumBand(24, 28, 1, 9, 15) },
    { id: 'A-7', level: 'A', name: 'Addition summary', detail: 'Every sum up to 28, mixed', target: 3.8, gen: sumBand(10, 28, 1, 9, 1) },
    { id: 'A-8', level: 'A', name: 'Add 10', detail: 'Add 10 to numbers over 24', target: 3.0, gen: addFixed([10], 25, 79) },
    { id: 'A-9', level: 'A', name: 'Add 11', detail: 'Add 11 to numbers over 24', target: 3.6, gen: addFixed([11], 25, 79) },
    { id: 'A-10', level: 'A', name: 'Take away 1, 2, 3', detail: 'From numbers up to 30', target: 3.4, gen: subRange(4, 30, 1, 3, positive) },
    { id: 'A-11', level: 'A', name: 'Take away 4, 5, 6', detail: 'From numbers up to 30', target: 3.8, gen: subRange(7, 30, 4, 6, positive) },
    { id: 'A-12', level: 'A', name: 'Take away 7, 8, 9', detail: 'From numbers up to 30', target: 4.0, gen: subRange(10, 30, 7, 9, positive) },
    { id: 'A-13', level: 'A', name: 'Back over the ten', detail: 'Like 15 - 8', target: 4.2, gen: subRange(11, 20, 4, 9, borrows) },
    { id: 'A-14', level: 'A', name: 'Canopy mixed', detail: 'Adding and taking away together', target: 4.2, gen: function () { return KM.rng() < 0.5 ? sumBand(10, 28, 1, 9, 1)() : subRange(10, 30, 1, 9, positive)() } },

    // ---- Level B: columns ----
    { id: 'B-1', level: 'B', name: '2-digit + 1-digit', detail: 'No carrying yet', target: 4.0, gen: addRange(11, 89, 1, 8, noCross) },
    { id: 'B-2', level: 'B', name: 'Carrying begins', detail: '2-digit + 1-digit with a carry', target: 4.6, gen: addRange(11, 89, 2, 9, crossesTen) },
    { id: 'B-3', level: 'B', name: '2-digit + 2-digit', detail: 'No carrying', target: 4.6, gen: addRange(11, 79, 11, 79, function (p) { return p.a % 10 + (p.b % 10) < 10 && p.answer < 100 }) },
    { id: 'B-4', level: 'B', name: '2-digit + 2-digit, carry', detail: 'One carry', target: 5.4, gen: addRange(14, 88, 14, 88, function (p) { return p.a % 10 + (p.b % 10) >= 10 }) },
    { id: 'B-5', level: 'B', name: '3-digit + 2-digit', detail: 'Bigger columns', target: 6.0, gen: addRange(101, 899, 11, 99) },
    { id: 'B-6', level: 'B', name: '2-digit - 1-digit', detail: 'No borrowing', target: 4.2, gen: subRange(11, 99, 1, 9, noBorrow) },
    { id: 'B-7', level: 'B', name: 'Borrowing begins', detail: '2-digit - 1-digit with a borrow', target: 5.0, gen: subRange(11, 99, 2, 9, borrows) },
    { id: 'B-8', level: 'B', name: '2-digit - 2-digit', detail: 'Mixed borrowing', target: 5.6, gen: subRange(21, 99, 11, 89, positive) },
    { id: 'B-9', level: 'B', name: '3-digit - 2-digit', detail: 'Bigger columns', target: 6.4, gen: subRange(101, 899, 11, 99, positive) },
    { id: 'B-10', level: 'B', name: 'Treetops mixed', detail: 'Add and take away, two digits', target: 5.4, gen: function () { return KM.rng() < 0.5 ? addRange(14, 88, 14, 88)() : subRange(21, 99, 11, 89, positive)() } },

    // ---- Level C: times tables and sharing ----
    { id: 'C-1', level: 'C', name: 'Times 2', detail: 'The 2 times table', target: 3.4, gen: function () { return mul(ri(1, 12), 2) } },
    { id: 'C-2', level: 'C', name: 'Times 5 and 10', detail: 'The easy ones', target: 3.2, gen: function () { return mul(ri(1, 12), pick([5, 10])) } },
    { id: 'C-3', level: 'C', name: 'Times 3 and 4', detail: 'Building up', target: 3.8, gen: function () { return mul(ri(1, 12), pick([3, 4])) } },
    { id: 'C-4', level: 'C', name: 'Times 6 and 7', detail: 'The tricky middle', target: 4.4, gen: function () { return mul(ri(1, 12), pick([6, 7])) } },
    { id: 'C-5', level: 'C', name: 'Times 8 and 9', detail: 'Nearly there', target: 4.4, gen: function () { return mul(ri(1, 12), pick([8, 9])) } },
    { id: 'C-6', level: 'C', name: 'All the tables', detail: 'Mixed up to 12 x 12', target: 4.0, gen: function () { return mul(ri(2, 12), ri(2, 12)) } },
    { id: 'C-7', level: 'C', name: '2-digit x 1-digit', detail: 'Like 34 x 3', target: 6.5, gen: function () { return mul(ri(11, 49), ri(2, 9)) } },
    { id: 'C-8', level: 'C', name: 'Sharing by 2, 5, 10', detail: 'Dividing with no leftovers', target: 4.2, gen: function () { return div(ri(1, 12), pick([2, 5, 10])) } },
    { id: 'C-9', level: 'C', name: 'Sharing by 3, 4, 6', detail: 'Dividing with no leftovers', target: 4.6, gen: function () { return div(ri(1, 12), pick([3, 4, 6])) } },
    { id: 'C-10', level: 'C', name: 'Open Sky mixed', detail: 'Times and sharing together', target: 4.6, gen: function () { return KM.rng() < 0.5 ? mul(ri(2, 12), ri(2, 12)) : div(ri(2, 12), ri(2, 9)) } },
  ]

  // Where a brand new profile starts: Level A, the "sums up to 24" section.
  // Change it in the Grown-ups screen any time.
  KM.DEFAULT_STAGE = 'A-5'

  KM.SIGNS = { '+': '+', '-': '−', '*': '×', '/': '÷' }

  KM.stage = function (id) {
    for (var i = 0; i < KM.STAGES.length; i++) if (KM.STAGES[i].id === id) return KM.STAGES[i]
    return null
  }
  KM.stageIndex = function (id) {
    for (var i = 0; i < KM.STAGES.length; i++) if (KM.STAGES[i].id === id) return i
    return -1
  }
  KM.nextStage = function (id) {
    var i = KM.stageIndex(id)
    return i >= 0 && i < KM.STAGES.length - 1 ? KM.STAGES[i + 1] : null
  }
  KM.level = function (id) {
    for (var i = 0; i < KM.LEVELS.length; i++) if (KM.LEVELS[i].id === id) return KM.LEVELS[i]
    return null
  }
  KM.stagesOfLevel = function (id) {
    return KM.STAGES.filter(function (s) {
      return s.level === id
    })
  }
  KM.factKey = function (p) {
    return p.a + p.op + p.b
  }
})(typeof globalThis !== 'undefined' ? globalThis : this)
