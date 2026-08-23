/*
 * juice.js — the part that makes a right answer feel like something.
 *
 * One canvas sits over the whole app for particles; everything else is a
 * short-lived DOM element that removes itself. All of it checks the motion
 * setting first, so the whole app can be calmed down in one switch.
 */
;(function (root) {
  var KM = (root.KM = root.KM || {})
  var doc = root.document

  var canvas = null
  var ctx = null
  var parts = []
  var raf = null
  var motion = true

  // Scarlet macaw plumage: red body, yellow and blue wing bars, with a
  // couple of jungle greens so bursts read as feathers-and-leaves.
  var PALETTE = ['#E63946', '#FF7B3D', '#FFC93C', '#2C7BE5', '#20B2AA', '#2FA84F', '#FFFFFF']

  function ensure() {
    if (canvas) return
    canvas = doc.createElement('canvas')
    canvas.className = 'fx'
    doc.body.appendChild(canvas)
    ctx = canvas.getContext('2d')
    resize()
    root.addEventListener('resize', resize)
  }

  function resize() {
    if (!canvas) return
    var dpr = Math.min(root.devicePixelRatio || 1, 2)
    canvas.width = root.innerWidth * dpr
    canvas.height = root.innerHeight * dpr
    canvas.style.width = root.innerWidth + 'px'
    canvas.style.height = root.innerHeight + 'px'
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  }

  function tick() {
    raf = null
    if (!ctx) return
    ctx.clearRect(0, 0, root.innerWidth, root.innerHeight)
    for (var i = parts.length - 1; i >= 0; i--) {
      var p = parts[i]
      p.vy += p.g
      p.vx *= 0.99
      p.x += p.vx
      p.y += p.vy
      p.life--
      p.rot += p.spin
      if (p.life <= 0 || p.y > root.innerHeight + 40) {
        parts.splice(i, 1)
        continue
      }
      ctx.save()
      ctx.globalAlpha = Math.max(0, Math.min(1, p.life / 30))
      ctx.translate(p.x, p.y)
      ctx.rotate(p.rot)
      ctx.fillStyle = p.color
      if (p.shape === 'circle') {
        ctx.beginPath()
        ctx.arc(0, 0, p.size / 2, 0, Math.PI * 2)
        ctx.fill()
      } else if (p.shape === 'star') {
        star(ctx, p.size)
      } else if (p.shape === 'feather') {
        feather(ctx, p.size)
      } else {
        ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2)
      }
      ctx.restore()
    }
    if (parts.length) raf = root.requestAnimationFrame(tick)
    else ctx.clearRect(0, 0, root.innerWidth, root.innerHeight)
  }

  // A single curved feather: two arcs meeting at the tip, with a quill.
  function feather(c, size) {
    var w = size * 0.42
    var h = size * 1.15
    c.beginPath()
    c.moveTo(0, -h / 2)
    c.quadraticCurveTo(w, -h * 0.1, 0, h / 2)
    c.quadraticCurveTo(-w, -h * 0.1, 0, -h / 2)
    c.fill()
    c.globalAlpha *= 0.55
    c.fillRect(-size * 0.03, -h / 2, size * 0.06, h)
  }

  function star(c, size) {
    var r = size / 2
    c.beginPath()
    for (var i = 0; i < 10; i++) {
      var rad = i % 2 ? r * 0.45 : r
      var a = (Math.PI / 5) * i - Math.PI / 2
      c[i ? 'lineTo' : 'moveTo'](Math.cos(a) * rad, Math.sin(a) * rad)
    }
    c.closePath()
    c.fill()
  }

  function kick() {
    if (!raf) raf = root.requestAnimationFrame(tick)
  }

  function spawn(x, y, n, opts) {
    if (!motion) return
    ensure()
    opts = opts || {}
    for (var i = 0; i < n; i++) {
      var a = opts.cone ? -Math.PI / 2 + (KM.rng() - 0.5) * opts.cone : KM.rng() * Math.PI * 2
      var sp = (opts.speed || 8) * (0.4 + KM.rng())
      parts.push({
        x: x,
        y: y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp - (opts.lift || 2),
        g: opts.gravity == null ? 0.32 : opts.gravity,
        size: (opts.size || 12) * (0.6 + KM.rng() * 0.8),
        color: opts.color || PALETTE[Math.floor(KM.rng() * PALETTE.length)],
        life: (opts.life || 55) + KM.rng() * 20,
        rot: KM.rng() * Math.PI,
        spin: (KM.rng() - 0.5) * 0.3,
        shape: opts.shape || (KM.rng() < 0.5 ? 'feather' : KM.rng() < 0.55 ? 'star' : KM.rng() < 0.6 ? 'circle' : 'rect'),
      })
    }
    kick()
  }

  function centreOf(el) {
    if (!el) return { x: root.innerWidth / 2, y: root.innerHeight / 2 }
    var r = el.getBoundingClientRect()
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 }
  }

  var api = {
    setMotion: function (on) {
      motion = !!on
      if (!on) {
        parts.length = 0
        if (ctx) ctx.clearRect(0, 0, root.innerWidth, root.innerHeight)
      }
    },

    // A quick pop where she touched.
    burst: function (el, opts) {
      var c = centreOf(el)
      spawn(c.x, c.y, (opts && opts.n) || 18, opts)
    },

    // Big celebration from two lower corners, the classic "you did it" shape.
    confetti: function (n) {
      if (!motion) return
      var h = root.innerHeight
      spawn(0, h, (n || 60) / 2, { cone: 1.2, speed: 17, lift: 8, life: 90 })
      spawn(root.innerWidth, h, (n || 60) / 2, { cone: 1.2, speed: 17, lift: 8, life: 90 })
    },

    rain: function (n) {
      if (!motion) return
      for (var i = 0; i < (n || 40); i++) {
        spawn(KM.rng() * root.innerWidth, -20, 1, { speed: 1, lift: -1, gravity: 0.18, life: 200 })
      }
    },

    // A ripple exactly under the finger — the cheapest way to make a touch
    // feel like it landed.
    ripple: function (el, ev) {
      if (!motion || !el) return
      var r = el.getBoundingClientRect()
      var t = ev && ev.touches && ev.touches[0] ? ev.touches[0] : ev
      var x = t && t.clientX != null ? t.clientX - r.left : r.width / 2
      var y = t && t.clientY != null ? t.clientY - r.top : r.height / 2
      var d = doc.createElement('span')
      d.className = 'ripple'
      d.style.left = x + 'px'
      d.style.top = y + 'px'
      el.appendChild(d)
      root.setTimeout(function () {
        d.remove()
      }, 520)
    },

    // "Nice!", "Bravo!", "Wow!" drifting up and away. Anchored to the TOP of
    // the target so it never sits on top of the number she just typed.
    float: function (text, el, cls) {
      if (!motion) return
      var c = centreOf(el)
      if (el && el.getBoundingClientRect) c.y = el.getBoundingClientRect().top
      var d = doc.createElement('div')
      d.className = 'floater ' + (cls || '')
      d.textContent = text
      d.style.left = c.x + 'px'
      d.style.top = c.y + 'px'
      doc.body.appendChild(d)
      root.setTimeout(function () {
        d.remove()
      }, 1100)
    },

    shake: function (el, hard) {
      if (!el) return
      var cls = hard ? 'shake-hard' : 'shake'
      el.classList.remove(cls)
      // Reading offsetWidth restarts the animation if it is already running.
      void el.offsetWidth
      el.classList.add(cls)
      root.setTimeout(function () {
        el.classList.remove(cls)
      }, 600)
    },

    pop: function (el) {
      if (!el) return
      el.classList.remove('pop')
      void el.offsetWidth
      el.classList.add('pop')
    },

    flash: function (kind) {
      if (!motion) return
      var d = doc.createElement('div')
      d.className = 'flash flash-' + kind
      doc.body.appendChild(d)
      root.setTimeout(function () {
        d.remove()
      }, 420)
    },

    // iPads do not do navigator.vibrate, so this is a no-op there and a nice
    // little bump on Android and desktop Chrome.
    buzz: function (ms) {
      if (motion && root.navigator && root.navigator.vibrate) {
        try {
          root.navigator.vibrate(ms || 12)
        } catch (e) {}
      }
    },
  }

  KM.juice = api
})(typeof globalThis !== 'undefined' ? globalThis : this)
