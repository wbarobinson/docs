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

  // The level's hue, as this child's world colours it.
  function theme(levelId) {
    var place = KM.place(levelId, KM.store.profile().theme)
    if (place) doc.documentElement.style.setProperty('--hue', place.hue)
  }

  // Everything that changes when you swap child: mascot, decoration, the
  // words on the buttons. Called on every screen change, so a swap is instant.
  function applyTheme() {
    var t = KM.store.theme()
    var p = KM.store.profile()
    doc.documentElement.style.setProperty('--decor', JSON.stringify(t.decor))
    var mascot = el('mascot')
    if (mascot) mascot.textContent = t.mascot
    var mapTitle = doc.querySelector('#map h1')
    if (mapTitle) mapTitle.textContent = t.mapTitle
    var mapBtn = el('btn-map')
    if (mapBtn) mapBtn.textContent = t.mapTitle
    var resume = el('btn-resume')
    if (resume) resume.firstChild.nodeValue = 'Carry on ' + t.token + ' '
    var play = el('btn-play')
    if (play) play.textContent = "Let's go! " + t.mascot
    el('home-avatar').textContent = p.avatar
    el('home-name').textContent = p.name
  }

  function show(name) {
    var screens = doc.querySelectorAll('.screen')
    for (var i = 0; i < screens.length; i++) screens[i].classList.toggle('active', screens[i].id === name)
    current = name
    applyTheme()
    if (name === 'who') renderWho()
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
    var lv = KM.place(stage.level, p.theme)
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

    el('home-run').innerHTML = beadRow(rec.run)
    var unit = KM.store.theme().unit
    el('home-runlabel').textContent = rec.mastered
      ? 'This ' + unit + ' is already passed — free choice!'
      : rec.run === 0
        ? 'Three quick, accurate sets in a row to move up a ' + unit
        : rec.run + ' of 3 in a row — ' + (3 - rec.run) + ' more to move up!'

    // Today's goal is its own thing, and it never resets when a run breaks.
    el('home-day').innerHTML = dayRow(KM.store.dayProgress(p))
  }

  // ---------- who's playing ----------

  function renderWho() {
    var active = KM.store.profile()
    var html = KM.store
      .profiles()
      .map(function (x) {
        var t = KM.theme(x.theme)
        var stage = KM.stage(x.stageId) || KM.stage(KM.DEFAULT_STAGE)
        return (
          '<button class="whocard' +
          (x.id === active.id ? ' active' : '') +
          '" data-profile="' +
          x.id +
          '" style="--hue:' +
          KM.place(stage.level, x.theme).hue +
          '"><span class="face">' +
          x.avatar +
          '</span><span class="nm">' +
          esc(x.name) +
          '</span><span class="tiny muted">' +
          esc(t.name) +
          '</span><span class="tiny muted">' +
          esc(stage.name) +
          ' · ⭐ ' +
          x.totals.stars +
          '</span></button>'
        )
      })
      .join('')
    html +=
      '<button class="whocard add" id="who-add"><span class="face">➕</span><span class="nm">Add someone</span></button>'
    el('who-body').innerHTML = html
  }

  // ---------- map ----------

  function renderMap() {
    var p = KM.store.profile()
    var unlockedIdx = KM.stageIndex(p.unlockedTo)
    var html = ''

    KM.LEVELS.forEach(function (level) {
      var lv = KM.place(level.id, p.theme)
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
    html += '<select id="g-theme">'
    Object.keys(KM.THEMES).forEach(function (key) {
      var t = KM.THEMES[key]
      html +=
        '<option value="' +
        key +
        '"' +
        (p.theme === key ? ' selected' : '') +
        '>' +
        t.mascot +
        ' ' +
        esc(t.name) +
        '</option>'
    })
    html += '</select>'
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
    KM.LEVELS.forEach(function (level) {
      var lv = KM.place(level.id, p.theme)
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
    html += '<div class="row" style="margin-top:8px"><span class="grow">Points to finish a day</span><select id="s-daygoal">'
    ;[3, 5, 8].forEach(function (n) {
      html += '<option value="' + n + '"' + (p.settings.dayGoal === n ? ' selected' : '') + '>' + n + '</option>'
    })
    html += '</select></div>'
    html += '<div class="row" style="margin-top:8px"><span class="grow">Problems in a set</span><select id="s-size">'
    ;[5, 10, 20].forEach(function (n) {
      html += '<option value="' + n + '"' + (p.settings.setSize === n ? ' selected' : '') + '>' + n + '</option>'
    })
    html += '</select></div></div>'

    // Today, set by set. This exists because "she did two sets and only got
    // two points" is impossible to answer without seeing which sets counted.
    var todaysSets = (p.log || []).filter(function (e) {
      return e.day === KM.store.today()
    })
    html += '<div class="card"><h2>Today, set by set</h2>'
    if (!todaysSets.length) {
      html += '<p class="muted" style="margin:0">Nothing yet today.</p>'
    } else {
      html +=
        '<table class="data"><tr><th>Time</th><th>Branch</th><th>First try</th><th>Each</th><th>Counted?</th><th>Points</th></tr>'
      todaysSets.forEach(function (e) {
        var st = KM.stage(e.stageId)
        var per = e.count ? e.ms / e.count / 1000 : 0
        var target = st ? st.target : 0
        var why = e.good
          ? '<span style="color:var(--good-dark)">✅ good set</span>'
          : '<span style="color:var(--bad-dark)">' +
            (e.firstTry < Math.ceil(e.count * 0.9) ? 'accuracy' : 'too slow') +
            '</span>'
        var pts = e.points == null ? 1 : e.points
        html +=
          '<tr><td>' +
          new Date(e.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) +
          '</td><td>' +
          esc(st ? st.name : e.stageId) +
          '</td><td>' +
          e.firstTry +
          '/' +
          e.count +
          '</td><td>' +
          per.toFixed(1) +
          's<span class="tiny muted"> / ' +
          target +
          's</span></td><td>' +
          why +
          '</td><td><b>+' +
          pts +
          '</b>' +
          (pts > 1 ? '<span class="tiny muted"> (1 + ' + (pts - 1) + ' bonus)</span>' : '') +
          '</td></tr>'
      })
      var dayNow = KM.store.dayProgress(p)
      html +=
        '</table><p class="tiny muted" style="margin:8px 0 0">' +
        dayNow.points +
        ' of ' +
        dayNow.goal +
        ' points today. A set earns 1 point, plus a bonus point for each good set in a run it breaks — ' +
        'so the bonus only appears when the set before it was <b>good</b> (accurate <i>and</i> inside the target) <b>on the same branch</b>.' +
        '</p>'
    }
    html += '</div>'

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
      (inPreview()
        ? '<p class="tiny" style="margin:10px 0 0;color:var(--bad-dark)"><b>This is a preview copy.</b> Progress is stored against this exact page, so republishing the preview can clear it. Copy the backup above, then use the hosted copy at its own web address for practice that sticks.</p>'
        : '') +
      '</div>'

    // Family account
    var sync = KM.sync ? KM.sync.status() : { code: null }
    html += '<div class="card"><h2>Family account</h2>'
    if (sync.code) {
      html +=
        '<p class="tiny muted" style="margin:0 0 8px">Both children\'s progress is kept under this family code. Type it on another iPad, phone or laptop and it follows them there.</p>' +
        '<div class="codebox" id="g-code">' +
        esc(sync.code) +
        '</div>' +
        '<div class="row wrap" style="margin-top:10px">' +
        '<button class="btn small" id="g-sync">Sync now</button>' +
        '<button class="btn small ghost" id="g-copylink">Copy invite link</button>' +
        '<button class="btn small ghost" id="g-copycode">Copy code</button>' +
        '<button class="btn small ghost" id="g-leave">Stop syncing</button>' +
        '</div>' +
        '<p class="tiny muted" style="margin:8px 0 0">Send the invite link to another iPad, phone or laptop — opening it joins this family, no typing. Or type the code above into <b>Join</b> over there.</p>' +
        '<p class="tiny muted" style="margin:6px 0 0">' +
        (sync.lastSyncAt
          ? 'Last synced ' + new Date(sync.lastSyncAt).toLocaleString()
          : 'Not synced yet') +
        (sync.lastError ? ' · <span style="color:var(--bad-dark)">' + esc(sync.lastError) + '</span>' : '') +
        '</p>'
    } else {
      html +=
        '<p class="tiny muted" style="margin:0 0 8px">Progress currently lives on this device only. A family code keeps both children\'s progress on the server, so it survives a new device, a cleared browser or a new web address. No email, no password — the code is the key, so keep it somewhere safe.</p>' +
        '<div class="row wrap"><button class="btn small" id="g-newcode">Create a family code</button></div>' +
        '<p class="tiny muted" style="margin:12px 0 6px"><b>Already have one?</b> Type it here to join and pull everything in.</p>' +
        '<div class="row wrap"><input type="text" id="g-joincode" placeholder="fern-a7k2m9x4qp" style="width:230px" />' +
        '<button class="btn small ghost" id="g-join">Join</button></div>'
    }
    html += '</div>'

    // How it works + reset
    html +=
      '<div class="card"><h2>How the levels work</h2><p class="tiny muted" style="margin:0">' +
      'She moves up a branch after <b>three sets in a row</b> that are both accurate (9 of 10 right first try) and quick (inside the branch\'s target time). ' +
      'One scrappy or slow set resets the run — the same bargain a Kumon worksheet makes, and "in a row" is the point of it. ' +
      '<b>The day is where a lost run is made good.</b> Every finished set earns a point, and a set that breaks a run pays a bonus point for each good set the run had. ' +
      'So three good sets in a row is 3 points and a move up; two good then a wobble is <b>5 points</b> — the run is gone, but the evening counted for more, not less. ' +
      'Points are never taken away. ' +
      'Stars are per set: 3 = quick and near-perfect, 2 = solid, 1 = finished it.' +
      '</p></div>'

    html +=
      '<div class="card"><h2>Danger zone</h2><div class="row wrap">' +
      '<button class="btn small ghost" id="g-remove">Remove this child</button>' +
      '<button class="btn small ghost" id="g-wipe">Erase everything</button>' +
      '</div><p class="tiny muted" style="margin:8px 0 0">Everything lives in this browser only — nothing is uploaded anywhere.</p></div>'

    html +=
      '<p class="tiny muted" style="text-align:center;margin:4px 0 0">Build ' +
      esc(root.KM_BUILD || 'dev') +
      '</p>'

    el('grown-body').innerHTML = html + '</div>'
  }

  // Running inside someone else's page (the artifact preview) rather than at
  // its own address. Storage there belongs to the preview, not to us.
  function inPreview() {
    try {
      return root.self !== root.top
    } catch (e) {
      return true // cross-origin parent: definitely embedded
    }
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
        ' passed!</h2><p style="margin:0">Three good sets in a row — you have moved up to <b>' +
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
    var beads = beadRow(res.run)

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
          ' of 3 in a row. ' +
          (needed === 0
            ? ''
            : (needed === 1 ? 'One more' : needed + ' more') +
              ' and you move up to <b>' +
              esc(nextStage ? nextStage.name : 'the next one') +
              '</b> ' +
              KM.store.theme().token)
        : 'This one did not count towards moving up, so the three in a row start again. ' +
          (res.quick ? 'Just the accuracy to fix.' : 'Just the speed to fix.')) +
      '</p>'
    )
  }

  // Three beads for the run: solid for done, empty for still to do.
  function beadRow(run) {
    var out = ''
    for (var i = 0; i < 3; i++) out += '<i class="' + (i < run ? 'on' : '') + '"></i>'
    return out
  }

  // Today's points. Every set earns one and a broken run pays a bonus, so
  // this only ever goes up — a wobble adds to it rather than costing her.
  function dayRow(day) {
    var body
    if (day.goal <= 6) {
      var stars = ''
      for (var i = 0; i < day.goal; i++) stars += '<i class="' + (i < day.points ? 'on' : '') + '">⭐</i>'
      body = '<div class="daystars">' + stars + '</div>'
    } else {
      var pct = Math.min(100, Math.round((day.points / day.goal) * 100))
      body = '<div class="bar" style="width:min(280px,70vw)"><i style="width:' + pct + '%"></i></div>'
    }
    return (
      body +
      '<span class="tiny muted">' +
      (day.done
        ? 'Today is done! ' + day.points + ' points 🎉'
        : 'Today: ' + day.points + ' of ' + day.goal + ' points') +
      '</span>'
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
    var lv = KM.place(stage.level, p.theme)
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
      ? 'You moved up a ' + KM.store.theme().unit + '! ' + KM.store.theme().token
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

    // Today's stars, above the fold: after a miss this is the thing she most
    // needs to see, so it does not go below the buttons.
    // Where the points came from — the bonus is the whole point of this card,
    // so it gets said out loud.
    var earned =
      '<b>+' +
      res.pointsEarned +
      (res.pointsEarned === 1 ? ' point' : ' points') +
      '</b> for that set' +
      (res.bonusPoints
        ? ' — 1 for finishing it, and <b>' +
          res.bonusPoints +
          ' bonus</b> for the ' +
          (res.bonusPoints === 1 ? 'good set' : res.bonusPoints + ' good sets') +
          ' the wobble cost you.'
        : '.')
    el('res-day').innerHTML =
      '<h2 class="tiny muted" style="margin:0 0 8px;text-align:center">Today</h2>' +
      '<div class="dayrow">' +
      dayRow({ points: res.dayPoints, good: res.dayGood, goal: res.dayGoal, done: res.dayDone }) +
      '</div>' +
      '<p class="tiny" style="margin:8px 0 0;text-align:center">' +
      earned +
      '</p>' +
      '<p class="tiny muted" style="margin:4px 0 0;text-align:center">' +
      (res.dayDone
        ? 'Today is finished. Anything more is a bonus. 🎉'
        : 'Points only ever go up — a wobble adds to today rather than costing you.') +
      '</p>'

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

    // Stars land one at a time, each with its own chime — and the ones that
    // light up are the ones she actually earned, not simply the first N.
    var earned = [true, accurate, quick]
    var star = 0
    var timer = root.setInterval(function () {
      while (star < 3 && !earned[star]) star++ // skip the ones she missed
      if (star >= 3) {
        root.clearInterval(timer)
        if (res.stars >= 3) KM.juice.confetti(90)
        if (res.dayJustDone) {
        KM.juice.confetti(110)
        KM.juice.rain(40)
        KM.audio.levelUp()
        KM.audio.cheer()
        toast('Today is done! 🎉')
      }
      if (res.improvedBy > 0 || res.beatOwnBest) {
          var banner = doc.querySelector('.improve')
          if (banner) {
            KM.juice.pop(banner)
            KM.juice.burst(banner, { n: 26, speed: 9, color: '#2c7be5' })
          }
          KM.audio.cheer()
        }
        if (res.badges && res.badges.length) {
          KM.audio.badge()
          KM.audio.cheer()
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
    applyTheme: applyTheme,
    renderWho: renderWho,
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
