/*
 * play.js — the ten-problem set: input, timing, feedback.
 *
 * The input rule that makes this fast: as soon as she has typed as many digits
 * as the answer needs, we check it. No reaching for a submit button between
 * every problem — but ✓ still works for anyone who wants it.
 */
;(function (root) {
  var KM = (root.KM = root.KM || {})

  var PRAISE = ['Nice!', 'Yes!', 'Boom!', 'Bravo!', 'Sharp!', 'Lovely!', 'Zoom!', 'Ace!']
  var BIG_PRAISE = ['Amazing!', 'On fire!', 'Wow!', 'Unstoppable!', 'Superstar!']

  var s = null // the live session
  var typed = ''
  var locked = false // true between a right answer and the next problem
  var revealed = false
  var ticker = null

  var doc = root.document

  function el(id) {
    return KM.ui.el(id)
  }

  function begin(stageId) {
    var p = KM.store.profile()
    var stage = KM.stage(stageId || p.stageId) || KM.stage(KM.DEFAULT_STAGE)
    KM.store.clearSession()
    startSession(KM.engine.start(p, stage.id, p.settings.setSize))
  }

  // Pick up a set she was part way through — after an app switch, a reload, or
  // tapping ✕ and coming back.
  function resume() {
    var snap = KM.store.loadSession()
    if (!snap) return false
    startSession(KM.engine.resume(snap))
    KM.ui.toast('Carrying on where you left off 🪶')
    return true
  }

  function startSession(session) {
    s = session
    var stage = KM.stage(s.stageId)
    var p = KM.store.profile()
    typed = ''
    locked = false
    revealed = false
    KM.ui.theme(stage.level)
    KM.ui.show('play')
    var showTimer = p.settings.timer
    el('timer').hidden = !showTimer
    drawDots()
    drawCombo()
    drawProblem()
    KM.audio.swoosh()
    if (ticker) root.clearInterval(ticker)
    if (showTimer) {
      ticker = root.setInterval(function () {
        if (!s || s.finishedAt) return
        el('timer').textContent = KM.ui.fmtClock(Date.now() - s.startedAt)
      }, 250)
      el('timer').textContent = '0:00'
    }
  }

  function stop() {
    if (ticker) root.clearInterval(ticker)
    ticker = null
    s = null
  }

  // Green = right first time. Blue = right first time AND under the branch's
  // target, which is the thing mastery actually turns on. Gold = took another
  // go. White = where she is now.
  function drawDots() {
    var target = KM.stage(s.stageId).target * 1000
    var html = ''
    for (var i = 0; i < s.problems.length; i++) {
      var log = s.log[i]
      var cls = ''
      if (i < s.i && log) cls = !log.firstTry ? 'miss' : log.ms <= target ? 'fast' : 'done'
      else if (i === s.i) cls = 'now'
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
      ? 'It\'s <b>' + prob.answer + '</b> — type it in, then tap ✓ 🪶'
      : prob.revision
        ? '<span class="muted tiny">You\'ve met this one before</span>'
        : // A reminder for the first couple of problems, then out of the way.
          s.i < 2 && !KM.store.profile().settings.autoCheck
          ? '<span class="muted tiny">Type it, then tap ✓</span>'
          : ''
  }

  function drawSlot(state) {
    var slot = el('slot')
    if (!slot) return
    slot.textContent = typed
    slot.className = 'slot' + (typed ? '' : ' empty') + (state ? ' ' + state : '')
    drawGo()
  }

  // The ✓ pulses once the answer is as long as it needs to be, so she knows
  // the app is waiting on her, not the other way round.
  function drawGo() {
    var go = doc.querySelector('.key.act')
    if (!go || !s) return
    var ready = !locked && typed.length > 0 && typed.length >= KM.engine.expectedDigits(s)
    go.classList.toggle('ready', ready)
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
      else nudge()
      return
    }
    if (!/^\d$/.test(k)) return

    var want = KM.engine.expectedDigits(s)
    // Cap at the answer's length rather than wrapping around: an extra press
    // is a slip, and ⌫ is right there. Wrapping would silently eat the digit
    // she actually meant.
    if (typed.length >= want) {
      nudge()
      return
    }
    typed += k
    KM.audio.tap()
    KM.juice.buzz(8)
    drawSlot()
    if (KM.store.profile().settings.autoCheck && typed.length >= want) root.setTimeout(check, 90)
  }

  // She pressed a key that cannot do anything useful right now.
  function nudge() {
    KM.audio.back()
    var go = doc.querySelector('.key.act')
    KM.juice.shake(go)
    if (!typed) el('hint').innerHTML = '<span class="muted">Type your answer, then tap ✓</span>'
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
    drawGo()
    KM.juice.pop(el('slot'))
    KM.audio.correct(res.combo)
    KM.juice.flash('good')
    KM.juice.buzz(14)
    KM.juice.burst(el('slot'), { n: res.combo >= 5 ? 30 : 18, speed: res.combo >= 5 ? 11 : 8 })
    if (res.firstTry) {
      // The child's own world gets a say in what "well done" sounds like.
      var words = res.combo >= 5 ? BIG_PRAISE : PRAISE.concat(KM.store.theme().praise)
      var word = words[Math.floor(KM.rng() * words.length)]
      KM.juice.float(word, el('slot'), res.quick ? 'gold' : '')
    }
    drawDots()
    drawCombo()
    if (res.quick && res.firstTry) KM.juice.float('⚡', el('dots'), 'gold')
    if (res.combo === 5 || res.combo === 10 || res.combo === 20) {
      KM.juice.confetti(40)
      KM.audio.cheer()
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
      KM.audio.cheer()
      KM.juice.confetti(120)
      KM.juice.rain(50)
    }
    if (res.levelledUp) KM.ui.toast('New part of the jungle unlocked! 🌴')
    KM.ui.renderResult(res)
  }

  // ✕ keeps the half-finished set: everything answered is already recorded,
  // and the rest is waiting on the home screen under "Carry on".
  function quit() {
    var partWayThrough = !!(s && !s.finishedAt && s.i > 0)
    if (partWayThrough) KM.store.saveSession(KM.engine.snapshot(s))
    stop()
    KM.ui.show('home')
    KM.ui.toast(partWayThrough ? 'Saved — carry on any time 🪶' : 'Stopped — nothing lost 🪶')
  }

  KM.play = {
    begin: begin,
    resume: resume,
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
