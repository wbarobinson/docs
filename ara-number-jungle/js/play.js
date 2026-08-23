/*
 * play.js — the ten-problem set: input, timing, feedback.
 *
 * The input rule that makes this fast: as soon as she has typed as many digits
 * as the answer needs, we check it. No reaching for a submit button between
 * every problem — but ✓ still works for anyone who wants it.
 */
;(function (root) {
  var KM = (root.KM = root.KM || {})

  var PRAISE = ['Nice!', 'Yes!', 'Boom!', 'Bravo!', 'Sharp!', 'Lovely!', 'Zoom!', 'Ace!', 'Squawk!']
  var BIG_PRAISE = ['Amazing!', 'On fire!', 'Wow!', 'Unstoppable!', 'Superstar!']

  var s = null // the live session
  var typed = ''
  var locked = false // true between a right answer and the next problem
  var revealed = false
  var ticker = null

  function el(id) {
    return KM.ui.el(id)
  }

  function begin(stageId) {
    var p = KM.store.profile()
    var stage = KM.stage(stageId || p.stageId) || KM.stage(KM.DEFAULT_STAGE)
    s = KM.engine.start(p, stage.id, p.settings.setSize)
    typed = ''
    locked = false
    revealed = false
    KM.ui.theme(stage.level)
    KM.ui.show('play')
    el('timer').style.display = p.settings.timer ? '' : 'none'
    drawDots()
    drawCombo()
    drawProblem()
    KM.audio.swoosh()
    if (ticker) root.clearInterval(ticker)
    ticker = root.setInterval(function () {
      if (!s || s.finishedAt) return
      el('timer').textContent = KM.ui.fmtClock(Date.now() - s.startedAt)
    }, 250)
    el('timer').textContent = '0:00'
  }

  function stop() {
    if (ticker) root.clearInterval(ticker)
    ticker = null
    s = null
  }

  function drawDots() {
    var html = ''
    for (var i = 0; i < s.problems.length; i++) {
      var cls = i < s.i ? (s.log[i] && s.log[i].firstTry ? 'done' : 'miss') : i === s.i ? 'now' : ''
      html += '<i class="' + cls + '"></i>'
    }
    el('dots').innerHTML = html
  }

  function drawCombo() {
    var c = el('combo')
    c.classList.toggle('on', s.combo >= 3)
    c.querySelector('b').textContent = s.combo
  }

  function drawProblem() {
    var prob = KM.engine.current(s)
    if (!prob) return
    var slotCls = 'slot' + (typed ? '' : ' empty')
    el('problem').innerHTML =
      (prob.revision ? '<span class="revision pill tiny">🪶 again</span>' : '') +
      '<span>' +
      prob.a +
      '</span><span>' +
      KM.SIGNS[prob.op] +
      '</span><span>' +
      prob.b +
      '</span><span>=</span><span class="' +
      slotCls +
      '" id="slot">' +
      KM.ui.esc(typed) +
      '</span>'
    el('hint').innerHTML = revealed
      ? 'It\'s <b>' + prob.answer + '</b> — type it in 🪶'
      : prob.revision
        ? '<span class="muted tiny">You\'ve met this one before</span>'
        : ''
  }

  function drawSlot(state) {
    var slot = el('slot')
    if (!slot) return
    slot.textContent = typed
    slot.className = 'slot' + (typed ? '' : ' empty') + (state ? ' ' + state : '')
  }

  // ---- input ----

  function press(k) {
    if (!s || s.finishedAt) return
    if (locked) {
      // Tapping during the celebration just skips ahead to the next problem.
      if (k === 'go' || /^\d$/.test(k)) next()
      return
    }
    if (k === 'del') {
      if (!typed) return
      typed = typed.slice(0, -1)
      KM.audio.back()
      drawSlot()
      return
    }
    if (k === 'go') {
      if (typed) check()
      return
    }
    if (!/^\d$/.test(k)) return

    var want = KM.engine.expectedDigits(s)
    // Never let her type more digits than the answer could have; the extra
    // press would silently eat the digit she meant to start with.
    if (typed.length >= want) typed = ''
    typed += k
    KM.audio.tap()
    KM.juice.buzz(8)
    drawSlot()
    if (typed.length >= want) root.setTimeout(check, 90)
  }

  function check() {
    if (!s || locked || !typed) return
    var prob = KM.engine.current(s)
    var res = KM.engine.submit(s, typed)
    if (res.ignored) return

    if (!res.correct) {
      KM.audio.wrong()
      KM.juice.shake(el('problem'))
      KM.juice.flash('bad')
      KM.juice.buzz(45)
      drawSlot('wrong')
      revealed = res.reveal
      var msg = res.reveal
        ? 'It\'s <b>' + res.answer + '</b> — type it in 🪶'
        : ['Not quite — try again!', 'So close! Have another go.', 'Nearly! One more try.'][
            Math.floor(KM.rng() * 3)
          ]
      el('hint').innerHTML = msg
      root.setTimeout(function () {
        typed = ''
        drawSlot()
      }, 420)
      return
    }

    // Right.
    revealed = false
    locked = true
    drawSlot('right')
    KM.juice.pop(el('slot'))
    KM.audio.correct(res.combo)
    KM.juice.flash('good')
    KM.juice.buzz(14)
    KM.juice.burst(el('slot'), { n: res.combo >= 5 ? 30 : 18, speed: res.combo >= 5 ? 11 : 8 })
    if (res.firstTry) {
      var word =
        res.combo >= 5
          ? BIG_PRAISE[Math.floor(KM.rng() * BIG_PRAISE.length)]
          : PRAISE[Math.floor(KM.rng() * PRAISE.length)]
      KM.juice.float(word, el('slot'), res.quick ? 'gold' : '')
    }
    drawDots()
    drawCombo()
    if (res.combo === 5 || res.combo === 10 || res.combo === 20) {
      KM.juice.confetti(40)
      KM.audio.squawk()
      KM.ui.toast(res.combo + ' in a row! 🔥')
    }
    el('hint').innerHTML = ''

    if (res.done) {
      root.setTimeout(finish, 650)
      return
    }
    var p = KM.store.profile()
    if (p.settings.autoNext) root.setTimeout(next, 520)
    else el('hint').innerHTML = '<span class="muted">Tap ✓ for the next one</span>'
  }

  function next() {
    if (!s || s.finishedAt) return
    locked = false
    typed = ''
    revealed = false
    s.shownAt = Date.now() // the clock on a problem starts when she sees it
    drawProblem()
    drawDots()
  }

  function finish() {
    if (!s) return
    var res = KM.engine.finish(s)
    stop()
    if (res.mastered) {
      KM.audio.levelUp()
      KM.audio.squawk()
      KM.juice.confetti(120)
      KM.juice.rain(50)
    }
    if (res.levelledUp) KM.ui.toast('New part of the jungle unlocked! 🌴')
    KM.ui.renderResult(res)
  }

  function quit() {
    stop()
    KM.ui.show('home')
    KM.ui.toast('Stopped — nothing lost 🪶')
  }

  KM.play = {
    begin: begin,
    press: press,
    quit: quit,
    active: function () {
      return !!s && !s.finishedAt
    },
    stageId: function () {
      return s ? s.stageId : null
    },
  }
})(typeof globalThis !== 'undefined' ? globalThis : this)
