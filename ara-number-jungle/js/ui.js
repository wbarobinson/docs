/*
 * ui.js — screens and rendering.
 *
 * Every screen re-renders from the profile when it is shown, so there is only
 * ever one source of truth and no half-stale views to chase.
 */
;(function (root) {
  var KM = (root.KM = root.KM || {})
  var doc = root.document

  function el(id) {
    return doc.getElementById(id)
  }
  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
    })
  }
  function fmtClock(ms) {
    var s = Math.round(ms / 1000)
    return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0')
  }
  function fmtSecs(ms) {
    return (ms / 1000).toFixed(1) + 's'
  }
  function pct(x) {
    return Math.round(x * 100) + '%'
  }
  function starRow(n) {
    return '⭐'.repeat(n) + '☆'.repeat(Math.max(0, 3 - n))
  }

  var current = 'home'

  function theme(levelId) {
    var lv = KM.level(levelId)
    if (lv) doc.documentElement.style.setProperty('--hue', lv.hue)
  }

  function show(name) {
    var screens = doc.querySelectorAll('.screen')
    for (var i = 0; i < screens.length; i++) screens[i].classList.toggle('active', screens[i].id === name)
    current = name
    if (name === 'home') renderHome()
    if (name === 'map') renderMap()
    if (name === 'badges') renderBadges()
    if (name === 'grown') renderGrown()
    var sc = doc.querySelector('#' + name + ' .scroll')
    if (sc) sc.scrollTop = 0
  }

  function toast(msg) {
    var d = doc.createElement('div')
    d.className = 'toast'
    d.textContent = msg
    doc.body.appendChild(d)
    root.setTimeout(function () {
      d.remove()
    }, 2400)
  }

  // ---------- home ----------

  function renderHome() {
    var p = KM.store.profile()
    var stage = KM.stage(p.stageId) || KM.stage(KM.DEFAULT_STAGE)
    var lv = KM.level(stage.level)
    var rec = KM.store.stageRecord(p, stage.id)
    theme(stage.level)

    el('home-avatar').textContent = p.avatar
    el('home-name').textContent = p.name
    el('home-streak').textContent = '🔥 ' + p.streak.current
    el('home-stars').textContent = '⭐ ' + p.totals.stars
    el('home-badges').textContent = '🏅 ' + Object.keys(p.badges).length
    el('home-level').textContent = lv.name + ' · ' + lv.icon + ' ' + lv.place
    el('home-stage').textContent = stage.name
    el('home-detail').textContent = stage.detail

    // A half-finished set is offered before anything else.
    var snap = KM.store.loadSession()
    var resume = el('btn-resume')
    resume.hidden = !snap
    if (snap) {
      el('resume-count').textContent = snap.i + ' of ' + snap.problems.length
      var snapStage = KM.stage(snap.stageId)
      if (snapStage) resume.title = snapStage.name
    }
    el('storage-warning').hidden = KM.store.canStore()

    var beads = ''
    for (var i = 0; i < 3; i++) beads += '<i class="' + (i < rec.run ? 'on' : '') + '"></i>'
    el('home-run').innerHTML = beads
    el('home-runlabel').textContent = rec.mastered
      ? 'Branch already mastered — free flying!'
      : rec.run === 0
        ? 'Three quick, accurate sets in a row to fly up a branch'
        : rec.run + ' of 3 — ' + (3 - rec.run) + ' more to fly up!'
  }

  // ---------- map ----------

  function renderMap() {
    var p = KM.store.profile()
    var unlockedIdx = KM.stageIndex(p.unlockedTo)
    var html = ''

    KM.LEVELS.forEach(function (lv) {
      var prog = KM.store.levelProgress(p, lv.id)
      html +=
        '<div class="level"><h2 style="color:hsl(' +
        lv.hue +
        ' 75% 32%)">' +
        lv.icon +
        ' ' +
        esc(lv.place) +
        ' <span class="tiny muted">' +
        lv.name +
        ' · ' +
        esc(lv.blurb) +
        ' · ' +
        prog.done +
        '/' +
        prog.total +
        '</span></h2>'
      html += '<div class="bar" style="margin:0 0 10px"><i style="width:' + pct(prog.pct) + '"></i></div>'
      html += '<div class="stagelist">'
      KM.stagesOfLevel(lv.id).forEach(function (s) {
        var rec = p.stages[s.id] || {}
        var idx = KM.stageIndex(s.id)
        // Everything up to the furthest branch reached is open, so she can
        // always drop back for a confidence set.
        var locked = idx > unlockedIdx
        var cls =
          'stagechip' +
          (locked ? ' locked' : '') +
          (s.id === p.stageId ? ' current' : '') +
          (rec.mastered ? ' mastered' : '')
        var mark = locked ? '🔒' : rec.mastered ? '🏆' : rec.sets ? starRow(rec.stars || 0).slice(0, 2) : '🪶'
        html +=
          '<button class="' +
          cls +
          '" data-stage="' +
          s.id +
          '"' +
          (locked ? ' disabled' : '') +
          '><span class="mark">' +
          mark +
          '</span><span class="grow"><span class="nm">' +
          esc(s.name) +
          '</span><br><span class="tiny muted">' +
          esc(s.detail) +
          '</span></span></button>'
      })
      html += '</div></div>'
    })
    el('map-body').innerHTML = html
  }

  // ---------- badges ----------

  function renderBadges() {
    var p = KM.store.profile()
    var got = Object.keys(p.badges).length
    var html =
      '<p class="muted" style="margin-top:0">' +
      got +
      ' of ' +
      KM.BADGES.length +
      ' found. Keep going — the locked ones tell you how.</p><div class="badgegrid">'
    KM.BADGES.forEach(function (b) {
      var have = !!p.badges[b.id]
      html +=
        '<div class="badge' +
        (have ? '' : ' locked') +
        '"><div class="ic">' +
        b.icon +
        '</div><div class="nm">' +
        esc(b.name) +
        '</div><div class="tiny muted">' +
        esc(b.hint) +
        '</div></div>'
    })
    el('badges-body').innerHTML = html + '</div>'
  }

  // ---------- grown-ups ----------

  function renderGrown() {
    var p = KM.store.profile()
    var days = KM.store.recentDays(p, 14)
    var maxProblems = Math.max.apply(
      null,
      days.map(function (d) {
        return d.problems
      }),
    )
    var tricky = KM.store.trickyFacts(p, 8)
    var stage = KM.stage(p.stageId)
    var acc = p.totals.problems ? p.totals.correct / p.totals.problems : 0

    var html = '<div style="max-width:760px;margin:0 auto;display:grid;gap:14px">'

    // Who is practising
    html += '<div class="card"><h2>Who\'s practising</h2><div class="row wrap">'
    html += '<select id="g-profile">'
    KM.store.profiles().forEach(function (x) {
      html +=
        '<option value="' +
        x.id +
        '"' +
        (x.id === p.id ? ' selected' : '') +
        '>' +
        x.avatar +
        ' ' +
        esc(x.name) +
        '</option>'
    })
    html += '</select>'
    html += '<button class="btn small ghost" id="g-add">+ Add child</button>'
    html += '<input type="text" id="g-name" value="' + esc(p.name) + '" style="width:150px" />'
    html += '<button class="btn small ghost" id="g-rename">Save name</button>'
    html += '</div></div>'

    // Totals
    html +=
      '<div class="card"><h2>All time</h2><div class="statgrid">' +
      stat(p.totals.problems, 'problems') +
      stat(p.totals.sets, 'sets') +
      stat(pct(acc), 'right first try') +
      stat(Math.round(p.totals.ms / 60000) + 'm', 'practising') +
      stat(p.totals.stars, 'stars') +
      stat(p.streak.current + '/' + p.streak.best, 'streak now/best') +
      '</div></div>'

    // 14 day chart
    html += '<div class="card"><h2>Last 14 days</h2><div class="chart">'
    days.forEach(function (d) {
      var h = maxProblems ? Math.round((d.problems / maxProblems) * 100) : 0
      html +=
        '<div class="col" title="' +
        d.date +
        ': ' +
        d.problems +
        ' problems"><i style="height:' +
        h +
        '%"></i><span>' +
        d.date.slice(8) +
        '</span></div>'
    })
    html +=
      '</div><p class="tiny muted" style="margin:8px 0 0">Bars are problems answered. Aim for one or two sets a day — little and often beats a marathon.</p></div>'

    // Where she is
    html += '<div class="card"><h2>Where she is</h2>'
    html +=
      '<p style="margin:0 0 10px">Working on <b>' +
      esc(stage.name) +
      '</b> — ' +
      esc(stage.detail) +
      ' <span class="tiny muted">(' +
      stage.level +
      ', target ' +
      stage.target +
      's a problem)</span></p>'
    html += '<div class="row wrap"><select id="g-stage">'
    KM.LEVELS.forEach(function (lv) {
      html += '<optgroup label="' + lv.name + ' — ' + esc(lv.place) + '">'
      KM.stagesOfLevel(lv.id).forEach(function (s) {
        html +=
          '<option value="' +
          s.id +
          '"' +
          (s.id === p.stageId ? ' selected' : '') +
          '>' +
          esc(s.name) +
          ' — ' +
          esc(s.detail) +
          '</option>'
      })
      html += '</optgroup>'
    })
    html +=
      '</select><button class="btn small" id="g-setstage">Move her here</button></div>' +
      '<p class="tiny muted" style="margin:8px 0 0">Moving her also unlocks everything up to that branch on the map.</p></div>'

    // Per-stage history
    var seen = KM.STAGES.filter(function (s) {
      return (p.stages[s.id] || {}).sets
    })
    if (seen.length) {
      html +=
        '<div class="card"><h2>Branch by branch</h2><table class="data"><tr><th>Branch</th><th>Sets</th><th>First-try</th><th>Best time</th><th>Stars</th></tr>'
      seen.forEach(function (s) {
        var r = p.stages[s.id]
        html +=
          '<tr><td>' +
          (r.mastered ? '🏆 ' : '') +
          esc(s.name) +
          ' <span class="tiny muted">' +
          s.level +
          '</span></td><td>' +
          r.sets +
          '</td><td>' +
          pct(r.problems ? r.correct / r.problems : 0) +
          '</td><td>' +
          (r.bestMs ? fmtClock(r.bestMs) : '—') +
          '</td><td>' +
          starRow(r.stars || 0) +
          '</td></tr>'
      })
      html += '</table></div>'
    }

    // Tricky facts
    html += '<div class="card"><h2>Facts to watch</h2>'
    if (!tricky.length) {
      html += '<p class="muted" style="margin:0">Nothing sticking out yet. These appear once she has a few sets in.</p>'
    } else {
      html += '<table class="data"><tr><th>Fact</th><th>Seen</th><th>Wrong</th><th>Typical time</th></tr>'
      tricky.forEach(function (t) {
        var prob = KM.engine.parseFact(t.key)
        var label = prob ? prob.a + ' ' + KM.SIGNS[prob.op] + ' ' + prob.b : t.key
        html +=
          '<tr><td><b>' +
          esc(label) +
          '</b></td><td>' +
          t.n +
          '</td><td>' +
          pct(t.wrongRate) +
          '</td><td>' +
          fmtSecs(t.ms) +
          '</td></tr>'
      })
      html +=
        '</table><p class="tiny muted" style="margin:8px 0 0">Up to a third of each set is quietly made of these until they get quick.</p>'
    }
    html += '</div>'

    // Settings
    html += '<div class="card"><h2>Settings</h2>'
    html += sw('s-sound', 'Sound effects', p.settings.sound)
    html += sw('s-motion', 'Confetti and wiggles', p.settings.motion)
    html += sw('s-timer', 'Show the clock while she plays', p.settings.timer)
    html +=
      '<p class="tiny muted" style="margin:-2px 0 6px 74px">Off by default. Sets are timed either way — this only decides whether she watches it tick.</p>'
    html += sw('s-autonext', 'Jump straight to the next problem', p.settings.autoNext)
    html += sw('s-autocheck', 'Check the answer without tapping ✓', p.settings.autoCheck)
    html +=
      '<p class="tiny muted" style="margin:-2px 0 6px 74px">Faster, but a mistyped digit is marked wrong straight away.</p>'
    html += '<div class="row" style="margin-top:8px"><span class="grow">Problems in a set</span><select id="s-size">'
    ;[5, 10, 20].forEach(function (n) {
      html += '<option value="' + n + '"' + (p.settings.setSize === n ? ' selected' : '') + '>' + n + '</option>'
    })
    html += '</select></div></div>'

    // Backup you can paste somewhere safe
    html +=
      '<div class="card"><h2>Backup</h2>' +
      '<p class="tiny muted" style="margin:0 0 8px">Progress lives in this browser only. Copy this text somewhere safe (an email to yourself, a note) and you can paste it back here on any device.</p>' +
      '<textarea id="g-backup" class="backup" readonly rows="3">' +
      esc(KM.store.exportText()) +
      '</textarea>' +
      '<div class="row wrap" style="margin-top:8px"><button class="btn small" id="g-copy">Copy backup</button></div>' +
      '<p class="tiny muted" style="margin:14px 0 6px"><b>Restore:</b> paste a backup here and everything in it replaces what is on this device.</p>' +
      '<textarea id="g-restore-text" class="backup" rows="3" placeholder="Paste a backup here"></textarea>' +
      '<div class="row wrap" style="margin-top:8px"><button class="btn small ghost" id="g-restore">Restore from this text</button></div>' +
      (KM.store.canStore()
        ? ''
        : '<p class="tiny" style="margin:10px 0 0;color:var(--bad-dark)"><b>Careful:</b> this browser is refusing to save anything, so nothing done here will survive a reload. Open the app from a link rather than a file, and not in a private window.</p>') +
      '</div>'

    // How it works + reset
    html +=
      '<div class="card"><h2>How the levels work</h2><p class="tiny muted" style="margin:0">' +
      'She moves up a branch after <b>three sets in a row</b> that are both accurate (9 of 10 right first try) and quick (inside the branch\'s target time). ' +
      'One scrappy or slow set resets the run — the same bargain a Kumon worksheet makes. Stars are per set: 3 = quick and near-perfect, 2 = solid, 1 = finished it.' +
      '</p></div>'

    html +=
      '<div class="card"><h2>Danger zone</h2><div class="row wrap">' +
      '<button class="btn small ghost" id="g-remove">Remove this child</button>' +
      '<button class="btn small ghost" id="g-wipe">Erase everything</button>' +
      '</div><p class="tiny muted" style="margin:8px 0 0">Everything lives in this browser only — nothing is uploaded anywhere.</p></div>'

    el('grown-body').innerHTML = html + '</div>'
  }

  function stat(v, label, extra) {
    return (
      '<div class="stat"><b>' +
      v +
      '</b><span class="tiny muted">' +
      label +
      '</span>' +
      (extra || '') +
      '</div>'
    )
  }

  // "When do I move up?" answered on the screen itself: the two things a set
  // has to do, whether this one did them, and how many more are needed.
  function passingCard(res, stage, accurate) {
    if (res.mastered) {
      var next = KM.stage(res.nextStageId)
      return (
        '<h2>🏆 ' +
        esc(stage.name) +
        ' passed!</h2><p style="margin:0">Three good sets in a row — you have flown up to <b>' +
        esc(next ? next.name : 'the top of the jungle') +
        '</b>' +
        (next ? ': ' + esc(next.detail) : '') +
        '</p>'
      )
    }

    // Passing counts the branch target, never a personal best: the ladder does
    // not get easier because she had a good day.
    var counted = accurate && res.quick
    var needed = Math.max(0, 3 - res.run)
    var nextStage = KM.nextStage(stage.id)
    var beads = ''
    for (var b = 0; b < 3; b++) beads += '<i class="' + (b < res.run ? 'on' : '') + '"></i>'

    return (
      '<h2>Passing ' +
      esc(stage.name) +
      '</h2><p class="tiny muted" style="margin:0 0 10px">Three sets in a row that do both of these:</p>' +
      '<ul class="reqs">' +
      req(
        accurate,
        '9 of ' + res.count + ' right first try',
        Math.round(res.accuracy * res.count) + ' of ' + res.count,
      ) +
      req(res.quick, 'Under ' + stage.target + 's a problem', res.shown.toFixed(1) + 's') +
      '</ul><div class="runbeads" style="margin-top:12px">' +
      beads +
      '</div><p style="margin:10px 0 0;text-align:center">' +
      (counted
        ? '<b>That one counted!</b> ' +
          res.run +
          ' of 3. ' +
          (needed === 1 ? 'One more' : needed + ' more') +
          ' and you fly up to <b>' +
          esc(nextStage ? nextStage.name : 'the next branch') +
          '</b> 🪶'
        : 'This one did not count, so the run starts again at three. ' +
          (res.quick ? 'Just the accuracy to fix.' : 'Just the speed to fix.')) +
      '</p>'
    )
  }

  function req(done, label, actual) {
    return (
      '<li class="' +
      (done ? 'yes' : 'no') +
      '"><span class="mk">' +
      (done ? '✅' : '❌') +
      '</span><span class="grow">' +
      label +
      '</span><b>' +
      actual +
      '</b></li>'
    )
  }

  // The branches of one level, in order: 🏆 passed, 🪶 where she is now,
  // 🔒 still to come.
  function levelLadder(stage, currentId) {
    var p = KM.store.profile()
    var lv = KM.level(stage.level)
    var unlockedIdx = KM.stageIndex(p.unlockedTo)
    var rows = KM.stagesOfLevel(stage.level)
      .map(function (st) {
        var rec = p.stages[st.id] || {}
        var locked = KM.stageIndex(st.id) > unlockedIdx
        var here = st.id === currentId
        // ⭐ passed, 🦜 where she is, ⚪ open but not passed yet, 🔒 still locked.
        var mark = rec.mastered ? '⭐' : here ? '🦜' : locked ? '🔒' : '⚪'
        return (
          '<li class="' +
          (rec.mastered ? 'done ' : '') +
          (here ? 'here ' : '') +
          (locked ? 'locked' : '') +
          '"><span class="mk">' +
          mark +
          '</span><span>' +
          esc(st.name) +
          '</span></li>'
        )
      })
      .join('')
    var prog = KM.store.levelProgress(p, stage.level)
    return (
      '<h2 class="tiny muted" style="margin:0 0 8px">' +
      lv.icon +
      ' ' +
      esc(lv.place) +
      ' · ' +
      prog.done +
      ' of ' +
      prog.total +
      ' passed</h2><ul class="ladderlist">' +
      rows +
      '</ul>'
    )
  }

  // Seconds per problem for the last few sets on this branch. Shorter is
  // better, so the bars visibly shrink as she gets quicker.
  function sparkline(history, target) {
    if (!history || history.length < 2) return ''
    var recent = history.slice(-8)
    var max = Math.max.apply(null, recent)
    var bars = recent
      .map(function (v, i) {
        var last = i === recent.length - 1
        var h = Math.max(8, Math.round((v / max) * 100))
        return (
          '<div class="sbar' +
          (last ? ' now' : '') +
          (v <= target ? ' quick' : '') +
          '"><i style="height:' +
          h +
          '%"></i><span>' +
          v.toFixed(1) +
          '</span></div>'
        )
      })
      .join('')
    return (
      '<div class="card"><h2 class="tiny muted" style="margin:0 0 8px">Seconds a problem, last ' +
      recent.length +
      ' sets on this branch</h2><div class="spark">' +
      bars +
      '</div></div>'
    )
  }
  function sw(id, label, on) {
    return (
      '<label class="switch"><input type="checkbox" id="' +
      id +
      '"' +
      (on ? ' checked' : '') +
      ' /><span class="grow">' +
      label +
      '</span></label>'
    )
  }

  // ---------- results ----------

  function renderResult(res) {
    var stage = KM.stage(res.stageId)
    el('res-title').textContent = res.mastered
      ? 'You flew up a branch! 🪶'
      : res.stars === 3
        ? 'Three stars! 🌟'
        : res.accuracy === 1
          ? 'Every single one! ✨'
          : 'Nice work!'

    var spans = el('res-stars').children
    for (var i = 0; i < spans.length; i++) spans[i].classList.remove('on')

    // Each star says what it was for, and the ones she missed stay legible so
    // she can see what to aim at next time.
    var accurate = res.accuracy >= 0.9
    var quick = res.stars === 3 || (res.stars === 2 && !accurate)
    var labels = el('res-starlabels').children
    labels[0].textContent = 'Finished'
    labels[1].textContent = res.accuracy === 1 ? 'All correct' : accurate ? 'Accurate' : 'Accuracy'
    labels[2].textContent = quick
      ? res.beatOwnBest
        ? 'New record'
        : res.matchedOwnBest
          ? 'Held your best'
          : 'Quick'
      : 'Speed'
    for (var L = 0; L < labels.length; L++) {
      labels[L].classList.toggle('on', L < 1 || (L === 1 && accurate) || (L === 2 && quick))
    }

    // The next-set button says where it is going — and, just as importantly,
    // carries the branch it means, so pressing "Start Doubles" cannot hand her
    // another set of the branch she has just finished.
    var again = el('btn-again')
    var nextStage = res.mastered ? KM.stage(res.nextStageId) : null
    again.textContent = nextStage ? 'Start ' + nextStage.name + ' 🦜' : 'One more set 🦜'
    again.setAttribute('data-stage', nextStage ? nextStage.id : res.stageId)

    // The headline number is seconds-per-problem, because that is the one she
    // can move. Show where it came from and where it went.
    var faster = res.improvedBy > 0
    var slower = res.improvedBy < 0
    // No chip when the rounded numbers are identical: "same as last time"
    // sitting beside a record banner was a contradiction.
    var deltaChip = faster
      ? '<span class="delta good">▼ ' + res.improvedBy.toFixed(1) + 's faster</span>'
      : slower
        ? '<span class="delta">▲ ' + Math.abs(res.improvedBy).toFixed(1) + 's slower</span>'
        : ''

    el('res-stats').innerHTML =
      stat(Math.round(res.accuracy * res.count) + '/' + res.count, 'first try') +
      stat(fmtClock(res.ms), 'total time') +
      stat(
        (faster || slower ? '<s>' + res.shownPrevious.toFixed(1) + '</s> ' : '') +
          res.shown.toFixed(1) +
          's',
        'each (aim ' + stage.target + 's)',
        deltaChip,
      ) +
      stat('🔵 ' + res.quickAnswers + '/' + res.count, 'under ' + stage.target + 's')

    // A banner she cannot miss when she has actually got quicker.
    el('res-improve').innerHTML = faster
      ? '<div class="improve">⚡ <b>Faster than last time!</b> ' +
        res.shownPrevious.toFixed(1) +
        's → <b>' +
        res.shown.toFixed(1) +
        's</b> on every problem' +
        (res.beatOwnBest ? ' — a new record 🏆' : '') +
        '</div>'
      : res.beatOwnBest
        ? '<div class="improve">🏆 <b>New record!</b> ' + res.shown.toFixed(1) + 's on every problem</div>'
        : res.matchedOwnBest
          ? '<div class="improve">🏅 <b>You held your best pace!</b> ' +
            res.shown.toFixed(1) +
            's again on every problem</div>'
          : ''

    // And the shape of the last few sets, so progress is visible over days.
    el('res-history').innerHTML = sparkline(res.history, stage.target)

    // Where this branch sits in the level: what she has passed, where she is,
    // and what is still locked ahead of her.
    el('res-ladder').innerHTML = levelLadder(stage, res.nextStageId || stage.id)

    el('res-progress').innerHTML = passingCard(res, stage, accurate)

    el('res-badges').innerHTML = (res.badges || [])
      .map(function (b) {
        return (
          '<div class="badge-won"><span class="ic">' +
          b.icon +
          '</span><span><b>New badge: ' +
          esc(b.name) +
          '</b><br><span class="tiny muted">' +
          esc(b.hint) +
          '</span></span></div>'
        )
      })
      .join('')

    show('result')

    // Stars land one at a time, each with its own chime.
    var star = 0
    var timer = root.setInterval(function () {
      if (star >= res.stars) {
        root.clearInterval(timer)
        if (res.stars >= 3) KM.juice.confetti(90)
        if (res.improvedBy > 0 || res.beatOwnBest) {
          var banner = doc.querySelector('.improve')
          if (banner) {
            KM.juice.pop(banner)
            KM.juice.burst(banner, { n: 26, speed: 9, color: '#2c7be5' })
          }
          KM.audio.squawk()
        }
        if (res.badges && res.badges.length) {
          KM.audio.badge()
          KM.audio.squawk()
          KM.juice.confetti(70)
        }
        return
      }
      spans[star].classList.add('on')
      KM.audio.star(star)
      KM.juice.burst(spans[star], { n: 14, speed: 7 })
      star++
    }, 420)
    KM.audio.fanfare(res.stars)
  }

  KM.ui = {
    el: el,
    esc: esc,
    show: show,
    screen: function () {
      return current
    },
    theme: theme,
    toast: toast,
    fmtClock: fmtClock,
    fmtSecs: fmtSecs,
    starRow: starRow,
    renderHome: renderHome,
    renderMap: renderMap,
    renderBadges: renderBadges,
    renderGrown: renderGrown,
    renderResult: renderResult,
  }
})(typeof globalThis !== 'undefined' ? globalThis : this)
