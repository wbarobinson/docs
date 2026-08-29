/*
 * party.js — the Word Party, a between-clients reading moment.
 *
 * One word, four emoji. She reads the word and taps the picture it names.
 * Wrong guesses just wiggle away; the word stays until she finds it, and a
 * speaker button reads it aloud (that counts as a hint, not a fail).
 *
 * Word choice is adaptive off the per-word record in the store: mostly words
 * at her level, with one gentle revisit of something she has missed before.
 */
;(function (root) {
  var Party = (root.SalonParty = {})
  var Store, Words, Snd

  var ROUNDS = 3
  var CHOICES = 4

  var el = {}
  var run = null // { rounds: [...], i, stars, onDone }

  function init() {
    Store = root.SalonStore.store
    Words = root.SalonWords
    Snd = root.Sound
    el.view = document.getElementById('party-view')
    el.word = document.getElementById('party-word')
    el.grid = document.getElementById('party-grid')
    el.dots = document.getElementById('party-dots')
    el.say = document.getElementById('party-say')
    el.skip = document.getElementById('party-skip')
    el.say.addEventListener('click', function () {
      if (!run) return
      speak(run.rounds[run.i].word)
      Store.recordWord(run.rounds[run.i].word, false, run.rounds[run.i].level, true)
    })
    el.skip.addEventListener('click', close)
    if (!('speechSynthesis' in root)) el.say.hidden = true
  }

  function speak(word) {
    try {
      var u = new SpeechSynthesisUtterance(word)
      u.rate = 0.8
      root.speechSynthesis.cancel()
      root.speechSynthesis.speak(u)
    } catch (e) {}
  }

  /* How solid is a word already? Solid words drop out of rotation. */
  function solidity(rec) {
    if (!rec) return 0
    return Math.max(0, (rec.n || 0) - (rec.wrong || 0) * 0.5)
  }

  function currentLevel(p) {
    // Move up when enough words at this level are solid; never move down.
    var lvl = p.level || 1
    var atLevel = Words.bank.filter(function (w) { return w.level === lvl })
    var solid = atLevel.filter(function (w) { return solidity(p.words[w.word]) >= 2 }).length
    if (solid >= Math.min(8, Math.max(4, atLevel.length / 3)) && lvl < 4) {
      p.level = lvl + 1
      Store.save()
      return p.level
    }
    return lvl
  }

  function pickRounds(p) {
    var lvl = currentLevel(p)
    var pool = Words.bank.slice()
    var byWord = p.words || {}

    // A revisit: the word she has struggled with most recently.
    var struggles = pool.filter(function (w) {
      var r = byWord[w.word]
      return r && r.wrong > r.n && w.level <= lvl
    }).sort(function (a, b) { return (byWord[b.word].lastAt || 0) - (byWord[a.word].lastAt || 0) })

    // Fresh-ish words at her level, least-seen first, then a shuffle.
    var fresh = pool.filter(function (w) {
      return w.level === lvl && solidity(byWord[w.word]) < 3
    })
    if (fresh.length < ROUNDS) {
      fresh = fresh.concat(pool.filter(function (w) { return w.level === Math.max(1, lvl - 1) }))
    }
    fresh.sort(function (a, b) {
      var d = solidity(byWord[a.word]) - solidity(byWord[b.word])
      return d !== 0 ? d : Math.random() - 0.5
    })

    var rounds = []
    if (struggles.length && Math.random() < 0.7) rounds.push(struggles[0])
    for (var i = 0; rounds.length < ROUNDS && i < fresh.length; i++) {
      if (rounds.indexOf(fresh[i]) === -1) rounds.push(fresh[i])
    }
    // Tiny banks or brand-new profiles: fall back to anything.
    for (var j = 0; rounds.length < ROUNDS && j < pool.length; j++) {
      if (rounds.indexOf(pool[j]) === -1) rounds.push(pool[j])
    }
    return rounds
  }

  function distractors(round) {
    var out = []
    var pool = Words.bank.filter(function (w) {
      return w.word !== round.word && w.emoji !== round.emoji
    })
    // Prefer other categories so the pictures are not confusable.
    pool.sort(function (a, b) {
      var ca = a.category === round.category ? 1 : 0
      var cb = b.category === round.category ? 1 : 0
      return ca - cb || Math.random() - 0.5
    })
    for (var i = 0; out.length < CHOICES - 1 && i < pool.length; i++) {
      var dup = out.some(function (o) { return o.emoji === pool[i].emoji })
      if (!dup) out.push(pool[i])
    }
    return out
  }

  function renderRound() {
    run.answered = false
    var r = run.rounds[run.i]
    el.word.textContent = r.word
    el.word.className = 'party-word pop'
    void el.word.offsetWidth // restart the pop animation
    el.dots.textContent = new Array(run.i + 1).join('⭐') + new Array(run.rounds.length - run.i + 1).join('· ')

    var options = distractors(r).concat([r])
    options.sort(function () { return Math.random() - 0.5 })
    el.grid.innerHTML = ''
    options.forEach(function (o) {
      var b = document.createElement('button')
      b.className = 'party-choice'
      b.textContent = o.emoji
      b.setAttribute('aria-label', o.word)
      b.addEventListener('click', function () { choose(b, o, r) })
      el.grid.appendChild(b)
    })
  }

  function choose(btn, picked, r) {
    if (!run || run.answered) return
    if (picked.word === r.word) {
      run.answered = true
      btn.classList.add('right')
      Snd.play('sparkle')
      Store.recordWord(r.word, true, r.level)
      run.stars++
      setTimeout(function () {
        if (!run) return
        run.i++
        if (run.i >= run.rounds.length) finish()
        else renderRound()
      }, 650)
    } else {
      btn.classList.add('wrong')
      Snd.play('pop')
      Store.recordWord(r.word, false, r.level)
      setTimeout(function () { btn.classList.add('gone') }, 300)
    }
  }

  function finish() {
    var stars = run ? run.stars : 0
    el.word.textContent = stars > 0 ? '+' + stars + ' ⭐' : '🎈'
    el.grid.innerHTML = ''
    el.dots.textContent = ''
    Snd.play('cheer')
    setTimeout(close, 1100)
  }

  function close() {
    var done = run && run.onDone
    run = null
    el.view.classList.remove('show')
    if (done) done()
  }

  /* Between clients. Returns false if the party is off or has no words. */
  Party.start = function (onDone) {
    if (!el.view) init()
    var p = Store.profile()
    if (!p.settings.party || !Words || !Words.bank.length) return false
    run = { rounds: pickRounds(p), i: 0, stars: 0, onDone: onDone }
    if (!run.rounds.length) { run = null; return false }
    el.view.classList.add('show')
    renderRound()
    return true
  }

  Party.init = init
})(window);
