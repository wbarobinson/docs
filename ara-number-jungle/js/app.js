/*
 * app.js — boot and wiring.
 *
 * One delegated listener for taps, one for the physical keyboard (handy for
 * testing on a laptop), plus the iPad housekeeping: unlock audio on the first
 * touch, kill pinch-zoom, and register the offline worker.
 */
;(function (root) {
  var KM = (root.KM = root.KM || {})
  var doc = root.document
  var lastStage = null

  function settings() {
    return KM.store.profile().settings
  }

  function applySettings() {
    var s = settings()
    KM.audio.setEnabled(s.sound)
    KM.juice.setMotion(s.motion)
  }

  function saveSetting(key, value) {
    var p = KM.store.profile()
    p.settings[key] = value
    KM.store.save()
    applySettings()
  }

  // ---- taps ----

  function onPointerDown(ev) {
    var key = ev.target.closest ? ev.target.closest('.key') : null
    if (!key) return
    // pointerdown, not click: on a touch screen click lands ~80ms later and
    // that delay is very obvious when you are typing digits quickly.
    ev.preventDefault()
    KM.audio.unlock()
    KM.juice.ripple(key, ev)
    KM.play.press(key.getAttribute('data-k'))
  }

  function onClick(ev) {
    var t = ev.target
    var btn = t.closest ? t.closest('button') : null
    KM.audio.unlock()

    if (btn && btn.classList.contains('key')) return // handled on pointerdown

    if (btn) {
      KM.juice.ripple(btn, ev)

      var go = btn.getAttribute('data-go')
      if (go) {
        KM.audio.tap()
        KM.ui.show(go)
        return
      }

      var stageId = btn.getAttribute('data-stage')
      if (stageId) {
        lastStage = stageId
        KM.play.begin(stageId)
        return
      }

      switch (btn.id) {
        case 'btn-play':
          lastStage = KM.store.profile().stageId
          flapMascot()
          KM.play.begin(lastStage)
          return
        case 'btn-again':
          KM.play.begin(lastStage || KM.store.profile().stageId)
          return
        case 'btn-quit':
          KM.play.quit()
          return
        case 'g-add':
          KM.store.addProfile('New explorer', pickAvatar())
          KM.ui.renderGrown()
          KM.ui.toast('Added — pick a name below')
          return
        case 'g-rename': {
          var name = (doc.getElementById('g-name').value || '').trim().slice(0, 18)
          if (name) {
            KM.store.profile().name = name
            KM.store.save()
            KM.ui.renderGrown()
            KM.ui.toast('Saved')
          }
          return
        }
        case 'g-setstage': {
          var id = doc.getElementById('g-stage').value
          var p = KM.store.profile()
          p.stageId = id
          if (KM.stageIndex(id) > KM.stageIndex(p.unlockedTo)) p.unlockedTo = id
          KM.store.save()
          KM.ui.renderGrown()
          KM.ui.toast('Moved to ' + KM.stage(id).name)
          return
        }
        case 'g-remove':
          if (root.confirm('Remove ' + KM.store.profile().name + ' and all their progress?')) {
            KM.store.removeProfile(KM.store.profile().id)
            KM.ui.renderGrown()
          }
          return
        case 'g-wipe':
          if (root.confirm('Erase every child and all progress on this device?')) {
            KM.store.reset()
            applySettings()
            KM.ui.show('home')
          }
          return
      }
    }
  }

  function onChange(ev) {
    var t = ev.target
    switch (t.id) {
      case 'g-profile':
        KM.store.setActive(t.value)
        applySettings()
        KM.ui.renderGrown()
        return
      case 's-sound':
        saveSetting('sound', t.checked)
        if (t.checked) KM.audio.squawk()
        return
      case 's-motion':
        saveSetting('motion', t.checked)
        if (t.checked) KM.juice.confetti(30)
        return
      case 's-timer':
        saveSetting('timer', t.checked)
        return
      case 's-autonext':
        saveSetting('autoNext', t.checked)
        return
      case 's-size':
        saveSetting('setSize', parseInt(t.value, 10) || 10)
        return
    }
  }

  function onKeyDown(ev) {
    if (KM.ui.screen() === 'play') {
      if (/^[0-9]$/.test(ev.key)) {
        KM.play.press(ev.key)
        ev.preventDefault()
      } else if (ev.key === 'Backspace') {
        KM.play.press('del')
        ev.preventDefault()
      } else if (ev.key === 'Enter' || ev.key === ' ') {
        KM.play.press('go')
        ev.preventDefault()
      } else if (ev.key === 'Escape') {
        KM.play.quit()
      }
      return
    }
    if (ev.key === 'Enter' && KM.ui.screen() === 'home') {
      lastStage = KM.store.profile().stageId
      KM.play.begin(lastStage)
    }
  }

  function flapMascot() {
    var m = doc.getElementById('mascot')
    if (!m) return
    m.classList.remove('flap')
    void m.offsetWidth
    m.classList.add('flap')
  }

  function pickAvatar() {
    var list = ['🦜', '🐢', '🦊', '🐬', '🦋', '🐯', '🦁', '🐨', '🦄', '🐙']
    return list[Math.floor(Math.random() * list.length)]
  }

  function boot() {
    applySettings()
    KM.ui.show('home')

    doc.addEventListener('pointerdown', onPointerDown, { passive: false })
    doc.addEventListener('click', onClick)
    doc.addEventListener('change', onChange)
    doc.addEventListener('keydown', onKeyDown)

    // iPad housekeeping: no pinch zoom, no double-tap zoom, no stray audio
    // suspension when she comes back to the tab.
    doc.addEventListener('gesturestart', function (e) {
      e.preventDefault()
    })
    doc.addEventListener(
      'dblclick',
      function (e) {
        e.preventDefault()
      },
      { passive: false },
    )
    doc.addEventListener('visibilitychange', function () {
      if (!doc.hidden) KM.audio.unlock()
    })
    root.addEventListener('touchstart', function once() {
      KM.audio.unlock()
      root.removeEventListener('touchstart', once)
    })

    // Offline: once she has opened it on wifi it keeps working without.
    if ('serviceWorker' in root.navigator && root.location.protocol.indexOf('http') === 0) {
      root.navigator.serviceWorker.register('sw.js').catch(function () {
        /* fine — the app just needs the network next time */
      })
    }
  }

  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', boot)
  else boot()
})(typeof globalThis !== 'undefined' ? globalThis : this)
