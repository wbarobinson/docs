/*
 * audio.js — every sound is synthesised in the browser.
 *
 * No mp3s to download, nothing to go missing, and it all works offline. iOS
 * will not make a sound until the first real touch, so unlock() is wired to
 * the first tap anywhere.
 */
;(function (root) {
  var KM = (root.KM = root.KM || {})

  var ctx = null
  var master = null
  var enabled = true
  var unlocked = false

  // A major pentatonic run: every note lands happily on top of the last, so a
  // long combo climbs a little melody instead of just getting louder.
  var COMBO_NOTES = [523.25, 587.33, 659.25, 783.99, 880, 1046.5, 1174.66, 1318.51, 1567.98, 1760]

  function ac() {
    if (!ctx) {
      var C = root.AudioContext || root.webkitAudioContext
      if (!C) return null
      ctx = new C()
      master = ctx.createGain()
      master.gain.value = 0.5
      master.connect(ctx.destination)
    }
    return ctx
  }

  function unlock() {
    var c = ac()
    if (!c) return
    if (c.state === 'suspended') c.resume()
    if (!unlocked) {
      // A silent blip: iOS counts this as "the page made a sound during a
      // gesture" and lets everything through from here on.
      var o = c.createOscillator()
      var g = c.createGain()
      g.gain.value = 0.0001
      o.connect(g).connect(master)
      o.start()
      o.stop(c.currentTime + 0.01)
      unlocked = true
    }
  }

  // One note. type/attack/decay shape whether it reads as a click, a chime or a bloop.
  function note(freq, start, dur, opts) {
    var c = ac()
    if (!c || !enabled) return
    opts = opts || {}
    var t = c.currentTime + start
    var o = c.createOscillator()
    var g = c.createGain()
    o.type = opts.type || 'sine'
    o.frequency.setValueAtTime(freq, t)
    if (opts.slideTo) o.frequency.exponentialRampToValueAtTime(opts.slideTo, t + dur)
    var vol = opts.vol == null ? 0.3 : opts.vol
    g.gain.setValueAtTime(0.0001, t)
    g.gain.exponentialRampToValueAtTime(vol, t + (opts.attack || 0.01))
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
    o.connect(g).connect(master)
    o.start(t)
    o.stop(t + dur + 0.02)
  }

  function noise(start, dur, vol, freq) {
    var c = ac()
    if (!c || !enabled) return
    var n = Math.floor(c.sampleRate * dur)
    var buf = c.createBuffer(1, n, c.sampleRate)
    var d = buf.getChannelData(0)
    for (var i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n)
    var src = c.createBufferSource()
    src.buffer = buf
    var bp = c.createBiquadFilter()
    bp.type = 'bandpass'
    bp.frequency.value = freq || 2200
    var g = c.createGain()
    g.gain.value = vol == null ? 0.15 : vol
    src.connect(bp).connect(g).connect(master)
    src.start(c.currentTime + start)
  }

  var api = {
    setEnabled: function (on) {
      enabled = !!on
      if (on) unlock()
    },
    unlock: unlock,

    // A soft wooden tick under every numpad press. Short and dry on purpose:
    // she will hear it hundreds of times a session.
    tap: function () {
      note(420, 0, 0.06, { type: 'triangle', vol: 0.18, slideTo: 300 })
    },
    back: function () {
      note(300, 0, 0.08, { type: 'triangle', vol: 0.15, slideTo: 190 })
    },

    // Right answer: a two-note kiss that climbs with the combo.
    correct: function (combo) {
      var i = Math.min(COMBO_NOTES.length - 1, Math.max(0, (combo || 1) - 1))
      var f = COMBO_NOTES[i]
      note(f, 0, 0.16, { type: 'triangle', vol: 0.28 })
      note(f * 1.5, 0.055, 0.2, { type: 'sine', vol: 0.22 })
      noise(0, 0.09, 0.06, 3400)
    },

    // Wrong answer: low, soft, over quickly. Never a buzzer.
    wrong: function () {
      note(196, 0, 0.14, { type: 'sine', vol: 0.2, slideTo: 150 })
      note(146, 0.06, 0.16, { type: 'sine', vol: 0.14 })
    },

    // Set finished — a little fanfare whose length matches the star count.
    fanfare: function (stars) {
      var seq = [523.25, 659.25, 783.99, 1046.5]
      var n = Math.max(2, Math.min(4, (stars || 1) + 1))
      for (var i = 0; i < n; i++) note(seq[i], i * 0.11, 0.3, { type: 'triangle', vol: 0.26 })
      note(1318.51, n * 0.11, 0.5, { type: 'sine', vol: 0.2 })
      noise(n * 0.11, 0.4, 0.05, 5000)
    },

    star: function (i) {
      note([880, 1108.73, 1318.51][Math.min(2, i || 0)], 0, 0.3, { type: 'sine', vol: 0.25 })
    },

    // Badge: bigger, brassier, worth stopping for.
    badge: function () {
      var seq = [523.25, 659.25, 783.99, 1046.5, 1318.51]
      seq.forEach(function (f, i) {
        note(f, i * 0.08, 0.35, { type: 'square', vol: 0.12 })
        note(f * 2, i * 0.08, 0.35, { type: 'sine', vol: 0.14 })
      })
      noise(0.4, 0.5, 0.07, 4200)
    },

    // Stage mastered / new level.
    levelUp: function () {
      ;[392, 523.25, 659.25, 783.99, 1046.5, 1318.51].forEach(function (f, i) {
        note(f, i * 0.09, 0.4, { type: 'triangle', vol: 0.2 })
      })
    },

    // A cheeky macaw squawk: a fast pitch sweep with a wobble on top. Used
    // sparingly — badges and finished sets only.
    squawk: function () {
      var c = ac()
      if (!c || !enabled) return
      var t = c.currentTime
      var o = c.createOscillator()
      var lfo = c.createOscillator()
      var lfoGain = c.createGain()
      var g = c.createGain()
      var bp = c.createBiquadFilter()
      o.type = 'sawtooth'
      o.frequency.setValueAtTime(900, t)
      o.frequency.exponentialRampToValueAtTime(1500, t + 0.07)
      o.frequency.exponentialRampToValueAtTime(620, t + 0.28)
      lfo.frequency.value = 28
      lfoGain.gain.value = 110
      lfo.connect(lfoGain).connect(o.frequency)
      bp.type = 'bandpass'
      bp.frequency.value = 1400
      bp.Q.value = 3
      g.gain.setValueAtTime(0.0001, t)
      g.gain.exponentialRampToValueAtTime(0.16, t + 0.03)
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.3)
      o.connect(bp).connect(g).connect(master)
      o.start(t)
      lfo.start(t)
      o.stop(t + 0.32)
      lfo.stop(t + 0.32)
    },

    // Low, rough and short — a roar for the dinosaur world, the counterpart to
    // the macaw's squawk.
    roar: function () {
      var c = ac()
      if (!c || !enabled) return
      var t = c.currentTime
      var o = c.createOscillator()
      var sub = c.createOscillator()
      var g = c.createGain()
      var lp = c.createBiquadFilter()
      o.type = 'sawtooth'
      o.frequency.setValueAtTime(150, t)
      o.frequency.exponentialRampToValueAtTime(90, t + 0.18)
      o.frequency.exponentialRampToValueAtTime(60, t + 0.5)
      sub.type = 'square'
      sub.frequency.setValueAtTime(74, t)
      sub.frequency.exponentialRampToValueAtTime(45, t + 0.5)
      lp.type = 'lowpass'
      lp.frequency.setValueAtTime(1200, t)
      lp.frequency.exponentialRampToValueAtTime(300, t + 0.5)
      g.gain.setValueAtTime(0.0001, t)
      g.gain.exponentialRampToValueAtTime(0.22, t + 0.06)
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.55)
      o.connect(lp)
      sub.connect(lp)
      lp.connect(g).connect(master)
      o.start(t)
      sub.start(t)
      o.stop(t + 0.6)
      sub.stop(t + 0.6)
      noise(0, 0.5, 0.05, 500)
    },

    // Whatever noise this child's world makes when something goes well.
    cheer: function () {
      var t = KM.store && KM.store.theme ? KM.store.theme() : null
      if (t && t.cheer === 'roar') api.roar()
      else api.squawk()
    },

    swoosh: function () {
      note(700, 0, 0.18, { type: 'sine', vol: 0.1, slideTo: 1600 })
      noise(0, 0.18, 0.05, 1800)
    },
  }

  KM.audio = api
})(typeof globalThis !== 'undefined' ? globalThis : this)
