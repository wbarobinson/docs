/*
 * picture.js — showing how the numbers fit together.
 *
 * Only ever drawn when she gets one wrong, or when she asks: this is a
 * fluency drill, and a picture on every problem would work against the
 * automatic recall the whole ladder is built on.
 *
 * Which picture depends on the strategy, not on the operation:
 *   sums and differences inside 20 → ten frames, where the five-and-ten
 *     structure is the point ("make ten first")
 *   anything bigger              → an empty number line, which keeps working
 *     when the numbers are past drawing as dots
 *   times                        → an array, which is what multiplication
 *     actually looks like
 *   sharing                      → equal groups
 *
 * Underneath either arithmetic picture sits the number bond — the split that
 * makes bridging work (6 = 2 + 4) — because that is the idea; the rest is
 * just a way of seeing it.
 *
 * plan() is pure and returns a description; svg() draws it. Keeping them
 * apart means the teaching decisions can be tested without a browser.
 */
;(function (root) {
  var KM = (root.KM = root.KM || {})

  function nextTen(n) {
    return Math.ceil((n + 1) / 10) * 10
  }
  function prevTen(n) {
    return Math.floor((n - 1) / 10) * 10
  }

  // What strategy does this problem want shown?
  function plan(p) {
    if (!p) return null
    if (p.op === '*') {
      return { kind: 'array', a: p.a, b: p.b, op: p.op, answer: p.answer, rows: p.b, cols: p.a }
    }
    if (p.op === '/') {
      return { kind: 'groups', a: p.a, b: p.b, op: p.op, answer: p.answer, groups: p.b, each: p.answer }
    }

    var steps = []
    var bond = null
    var sign = p.op === '+' ? 1 : -1
    var at = p.a
    var left = p.b

    // A two-digit number added or taken away goes in tens first — "add ten,
    // add one" is how +11 is actually taught, not as a bridge over 70.
    if (left >= 10) {
      var tens = Math.floor(left / 10) * 10
      // A clean jump of tens needs no split shown: "10 = 10 + 0" is noise.
      if (left - tens > 0) bond = { whole: p.b, parts: [tens, left - tens] }
      steps.push({ from: at, add: sign * tens, to: at + sign * tens })
      at = at + sign * tens
      left = left - tens
    }

    // What is left crosses a ten? Split it so it lands on the ten first.
    if (left > 0) {
      var edge = sign > 0 ? nextTen(at) : prevTen(at)
      var toEdge = Math.abs(edge - at)
      if (left > toEdge) {
        // Only ever one bond on screen: the interesting split is this one.
        bond = { whole: left, parts: [toEdge, left - toEdge] }
        steps.push({ from: at, add: sign * toEdge, to: edge })
        steps.push({ from: edge, add: sign * (left - toEdge), to: p.answer })
      } else {
        steps.push({ from: at, add: sign * left, to: p.answer })
      }
    }
    if (!steps.length) steps.push({ from: p.a, add: 0, to: p.answer })

    // Ten frames stop being readable past two frames' worth.
    var biggest = Math.max(p.a, p.answer)
    var kind = biggest <= 20 ? 'tenframe' : 'numberline'
    return { kind: kind, a: p.a, b: p.b, op: p.op, answer: p.answer, steps: steps, bond: bond }
  }

  // --- drawing ------------------------------------------------------------

  function esc(s) {
    return String(s).replace(/[&<>]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]
    })
  }

  function tenFrames(plan) {
    // Dots for the starting number, then the added ones in a second colour,
    // with the ones that complete the ten marked so the split is visible.
    var total = Math.max(plan.a, plan.answer, plan.op === '-' ? plan.a : 0)
    var frames = Math.max(1, Math.ceil(total / 10))
    var cellW = 26
    var cellH = 26
    var gap = 12
    var frameW = 5 * cellW
    var width = frames * frameW + (frames - 1) * gap
    var height = 2 * cellH
    var fillTo = plan.op === '+' ? plan.a : plan.answer // subtraction empties down to the answer
    var changeTo = plan.op === '+' ? plan.answer : plan.a
    var bridgeAt = plan.bond ? (plan.op === '+' ? plan.a + plan.bond.parts[0] : plan.a - plan.bond.parts[0]) : null

    var out = ''
    for (var f = 0; f < frames; f++) {
      var ox = f * (frameW + gap)
      out +=
        '<rect x="' +
        ox +
        '" y="0" width="' +
        frameW +
        '" height="' +
        height +
        '" rx="6" class="pf-frame" />'
      for (var i = 0; i < 10; i++) {
        var n = f * 10 + i + 1
        var col = i % 5
        var row = i < 5 ? 0 : 1
        var cx = ox + col * cellW + cellW / 2
        var cy = row * cellH + cellH / 2
        var cls =
          n <= fillTo
            ? 'pf-dot pf-have'
            : n <= changeTo
              ? bridgeAt && n <= bridgeAt
                ? 'pf-dot pf-bridge'
                : 'pf-dot pf-add'
              : 'pf-dot pf-empty'
        out += '<circle cx="' + cx + '" cy="' + cy + '" r="9" class="' + cls + '" />'
      }
      // Proper ten-frame ruling: five cells across, two rows down. The
      // five-structure is the rows, so the grid goes between the cells and
      // never through a dot.
      for (var g = 1; g < 5; g++) {
        out +=
          '<line x1="' + (ox + g * cellW) + '" y1="0" x2="' + (ox + g * cellW) + '" y2="' + height + '" class="pf-mid" />'
      }
      out += '<line x1="' + ox + '" y1="' + cellH + '" x2="' + (ox + frameW) + '" y2="' + cellH + '" class="pf-mid" />'
    }
    return { svg: out, width: width, height: height }
  }

  function numberLine(plan) {
    var points = [plan.steps[0].from]
    plan.steps.forEach(function (s) {
      points.push(s.to)
    })
    // An empty number line is schematic, not to scale: the jumps are spaced
    // evenly so a +1 next to a +10 is still readable. Drawing it to scale
    // squashes the small jump into nothing, which is the opposite of the
    // point — this is how it is taught on a board.
    var width = 420
    var height = 96
    var y = 74
    var slots = points.length
    var x = function (v, i) {
      var step = (width - 60) / Math.max(1, slots - 1)
      return 30 + i * step
    }

    var out = '<line x1="6" y1="' + y + '" x2="' + (width - 6) + '" y2="' + y + '" class="pl-axis" />'
    plan.steps.forEach(function (s, i) {
      var x1 = x(s.from, i)
      var x2 = x(s.to, i + 1)
      var mid = (x1 + x2) / 2
      var lift = 34
      out +=
        '<path d="M ' +
        x1 +
        ' ' +
        y +
        ' Q ' +
        mid +
        ' ' +
        (y - lift) +
        ' ' +
        x2 +
        ' ' +
        y +
        '" class="pl-jump pl-jump-' +
        (i + 1) +
        '" />'
      out +=
        '<text x="' +
        mid +
        '" y="' +
        (y - lift * 0.72) +
        '" class="pl-jumplabel">' +
        (s.add > 0 ? '+' : '−') +
        Math.abs(s.add) +
        '</text>'
    })
    points.forEach(function (v, i) {
      var px = x(v, i)
      var last = i === points.length - 1
      out += '<circle cx="' + px + '" cy="' + y + '" r="5" class="pl-dot' + (last ? ' pl-end' : '') + '" />'
      out += '<text x="' + px + '" y="' + (y + 20) + '" class="pl-num' + (last ? ' pl-end' : '') + '">' + v + '</text>'
    })
    return { svg: out, width: width, height: height }
  }

  function array(plan) {
    var cols = Math.min(plan.cols, 12)
    var rows = plan.rows
    var cell = cols > 8 || rows > 8 ? 18 : 24
    var out = ''
    for (var r = 0; r < rows; r++) {
      for (var c = 0; c < cols; c++) {
        out +=
          '<circle cx="' +
          (c * cell + cell / 2) +
          '" cy="' +
          (r * cell + cell / 2) +
          '" r="' +
          (cell / 2 - 4) +
          '" class="pf-dot pf-have" />'
      }
    }
    return { svg: out, width: cols * cell, height: rows * cell }
  }

  function groups(plan) {
    var cell = 20
    var perRow = plan.each
    var out = ''
    for (var g = 0; g < plan.groups; g++) {
      var oy = g * (cell + 10)
      out +=
        '<rect x="0" y="' +
        oy +
        '" width="' +
        (perRow * cell + 8) +
        '" height="' +
        (cell + 6) +
        '" rx="8" class="pf-frame" />'
      for (var i = 0; i < perRow; i++) {
        out +=
          '<circle cx="' +
          (i * cell + cell / 2 + 4) +
          '" cy="' +
          (oy + cell / 2 + 3) +
          '" r="7" class="pf-dot pf-have" />'
      }
    }
    return { svg: out, width: perRow * cell + 8, height: plan.groups * (cell + 10) }
  }

  // The whole explanation: a sentence, the picture, and the bond underneath.
  function html(p) {
    var pl = plan(p)
    if (!pl) return ''
    var drawn =
      pl.kind === 'tenframe'
        ? tenFrames(pl)
        : pl.kind === 'numberline'
          ? numberLine(pl)
          : pl.kind === 'array'
            ? array(pl)
            : groups(pl)

    var bond = ''
    if (pl.bond) {
      bond =
        '<div class="pbond">' +
        '<b>' +
        pl.bond.whole +
        '</b> splits into <b>' +
        pl.bond.parts[0] +
        '</b> and <b>' +
        pl.bond.parts[1] +
        '</b>' +
        '</div>'
    }

    var story = ''
    if (pl.kind === 'array') {
      story = pl.rows + ' rows of ' + pl.cols + ' is <b>' + pl.answer + '</b>'
    } else if (pl.kind === 'groups') {
      story = pl.a + ' shared into ' + pl.groups + ' groups is <b>' + pl.each + '</b> each'
    } else {
      story = pl.steps
        .map(function (s) {
          return s.from + (s.add > 0 ? ' + ' : ' − ') + Math.abs(s.add) + ' = <b>' + s.to + '</b>'
        })
        .join(', then ')
    }

    return (
      '<div class="picture picture-' +
      pl.kind +
      '">' +
      '<svg viewBox="0 0 ' +
      drawn.width +
      ' ' +
      drawn.height +
      '" role="img" aria-label="' +
      esc(pl.a + ' ' + KM.SIGNS[pl.op] + ' ' + pl.b + ' = ' + pl.answer) +
      '">' +
      drawn.svg +
      '</svg>' +
      bond +
      '<div class="pstory">' +
      story +
      '</div>' +
      '</div>'
    )
  }

  KM.picture = { plan: plan, html: html }
})(typeof globalThis !== 'undefined' ? globalThis : this)
