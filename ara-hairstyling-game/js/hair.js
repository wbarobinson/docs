/* Ara's Hair Salon - hair simulation.
   A strand is a chain of points solved with Verlet integration.
   Everything is in a fixed 1000x750 "virtual" space; game.js scales it to the screen. */
(function (global) {
  'use strict';

  var clamp = function (v, a, b) { return v < a ? a : v > b ? b : v; };
  var lerp = function (a, b, t) { return a + (b - a) * t; };
  var rand = function (a, b) { return a + Math.random() * (b - a); };

  var HEAD = { cx: 500, cy: 300, rx: 112, ry: 132 };
  var SHOULDER_Y = HEAD.cy + HEAD.ry + 76;

  var SEGS = 16;      // segments in a full-length strand
  var SEG_LEN = 19;   // virtual px per segment
  var GRAVITY = 0.5;
  var DAMP = 0.9;
  var ITER = 3;

  /* ---------- strands ---------- */

  function makeStrand(angle, layer, color, depth) {
    var nx = Math.sin(angle), ny = -Math.cos(angle);
    var spread = layer === 'back' ? 1.02 : 0.94;
    var rx = HEAD.cx + nx * HEAD.rx * spread;
    var ry = HEAD.cy + ny * HEAD.ry * spread;

    var s = {
      angle: angle,
      layer: layer,
      depth: depth,             // 0..1, shades the strand so layers read apart
      n: SEGS,                  // current length in segments (scissors lower this)
      maxN: SEGS,
      segLen: SEG_LEN,
      curl: 0,
      frizz: rand(0.35, 0.75),
      shine: 0.35,
      phase: rand(0, Math.PI * 2),
      width: layer === 'back' ? rand(13, 17) : rand(9, 12.5),
      pts: [],
      fz: [],
      cols: [],
      braidSide: 0
    };

    for (var i = 0; i <= SEGS; i++) { s.fz.push(rand(-1, 1)); }
    for (var c = 0; c < SEGS; c++) { s.cols.push(color); }

    var px = rx, py = ry;
    var dx = nx * 0.7, dy = ny * 0.2 + 0.85;
    var dl = Math.hypot(dx, dy); dx /= dl; dy /= dl;
    s.pts.push({ x: px, y: py, ox: px, oy: py });
    for (var j = 1; j <= SEGS; j++) {
      px += dx * SEG_LEN; py += dy * SEG_LEN;
      dx *= 0.82; dy = dy * 0.82 + 0.35;
      var l2 = Math.hypot(dx, dy); dx /= l2; dy /= l2;
      s.pts.push({ x: px, y: py, ox: px, oy: py });
    }
    return s;
  }

  function createHair(color) {
    var strands = [];
    var backCount = 48, frontCount = 40;
    var i, t, a;
    for (i = 0; i < backCount; i++) {
      t = i / (backCount - 1);
      a = lerp(-1.62, 1.62, t);
      strands.push(makeStrand(a, 'back', color, 0.55 + Math.abs(t - 0.5) * 0.5));
    }
    for (i = 0; i < frontCount; i++) {
      t = i / (frontCount - 1);
      a = lerp(-1.5, 1.5, t);
      strands.push(makeStrand(a, 'front', color, 0.05 + Math.abs(t - 0.5) * 0.35));
    }
    return strands;
  }

  var SHOULDER_HALF = 235;

  /* Where the shoulder holds hair up at a given x. Past the shoulder there is
     nothing to rest on, so the hair keeps falling. */
  function shoulderAt(x) {
    var dx = Math.abs(x - HEAD.cx);
    if (dx > SHOULDER_HALF) { return 1e6; }
    var t = dx / SHOULDER_HALF;
    return SHOULDER_Y + t * t * 115;
  }

  /* ---------- physics ---------- */

  function pushOutOfHead(p, pad) {
    var dx = (p.x - HEAD.cx) / (HEAD.rx + pad);
    var dy = (p.y - HEAD.cy) / (HEAD.ry + pad);
    var d = Math.hypot(dx, dy);
    if (d < 1 && d > 0.0001) {
      var k = 1 / d;
      p.x = HEAD.cx + dx * k * (HEAD.rx + pad);
      p.y = HEAD.cy + dy * k * (HEAD.ry + pad);
    }
  }

  function step(state) {
    var strands = state.strands;
    var stiff = 0.07 + state.volume * 0.1;

    for (var si = 0; si < strands.length; si++) {
      var s = strands[si];
      var pts = s.pts;
      var n = s.n;

      for (var i = 1; i <= n; i++) {
        var p = pts[i];
        var vx = (p.x - p.ox) * DAMP;
        var vy = (p.y - p.oy) * DAMP;
        p.ox = p.x; p.oy = p.y;
        p.x += vx;
        p.y += vy + GRAVITY * (1 - state.volume * 0.35);
      }

      for (var it = 0; it < ITER; it++) {
        for (var c = 1; c <= n; c++) {
          var a = pts[c - 1], b = pts[c];
          var dx = b.x - a.x, dy = b.y - a.y;
          var d = Math.hypot(dx, dy) || 0.0001;
          var diff = (d - s.segLen) / d;
          var mA = c === 1 ? 0 : 0.5;   // root is pinned
          var mB = c === 1 ? 1 : 0.5;
          a.x += dx * diff * mA; a.y += dy * diff * mA;
          b.x -= dx * diff * mB; b.y -= dy * diff * mB;
        }

        for (var k = 2; k <= n; k++) {
          var q0 = pts[k - 2], q1 = pts[k - 1], q2 = pts[k];
          var tx = q1.x + (q1.x - q0.x), ty = q1.y + (q1.y - q0.y);
          q2.x += (tx - q2.x) * stiff;
          q2.y += (ty - q2.y) * stiff;
        }

        var pad = s.layer === 'back' ? 2 : 3;
        for (var h = 1; h <= n; h++) { pushOutOfHead(pts[h], pad); }
      }

      if (state.style && state.style !== 'down') { applyStyle(s, state); }

      for (var g = 1; g <= n; g++) {
        var pg = pts[g];
        var sy = shoulderAt(pg.x);
        if (pg.y > sy) {
          var over = pg.y - sy;
          pg.y = sy + over * 0.4;
          pg.ox = lerp(pg.ox, pg.x, 0.5);    // friction so it settles instead of sliding
          pg.x += (pg.x - HEAD.cx) * 0.0016 * Math.min(over, 26);
        }
      }
    }
  }

  /* ---------- styles ---------- */

  var STYLE_HOLD = 0.3;

  /* Styles whose tail is gathered and sent down the back of the head, rather
     than sitting at the sides. Their tails must not be drawn over the face. */
  var BEHIND_STYLES = { ponytail: 1, highpony: 1, braid: 1, halfup: 1 };

  function gatherPoint(style, s) {
    switch (style) {
      /* k is how many segments stay at the roots. The gathered styles use 1,
         so the whole length sweeps back and can be drawn behind the head. */
      case 'ponytail': return { x: HEAD.cx, y: HEAD.cy + HEAD.ry * 0.5, k: 1 };
      case 'highpony': return { x: HEAD.cx, y: HEAD.cy - HEAD.ry * 0.6, k: 1 };
      case 'braid': return { x: HEAD.cx, y: HEAD.cy + HEAD.ry * 0.58, k: 1 };
      case 'halfup':
        return Math.abs(s.angle) < 0.85 ? { x: HEAD.cx, y: HEAD.cy + HEAD.ry * 0.3, k: 1 } : null;
      case 'bun': return { x: HEAD.cx, y: HEAD.cy - HEAD.ry * 0.66, k: 4 };
      case 'pigtails':
        return { x: HEAD.cx + (s.angle < 0 ? -1 : 1) * (HEAD.rx + 16), y: HEAD.cy - 24, k: 5 };
      default: return null;
    }
  }

  function tailTarget(style, G, i, s, time) {
    var d = i * SEG_LEN;
    if (style === 'bun') {
      var turns = d / 34;
      var r = 20 + Math.min(14, d * 0.05);
      return { x: G.x + Math.cos(turns + s.phase) * r, y: G.y + Math.sin(turns + s.phase) * r * 0.8 };
    }
    var sway = Math.sin(time * 0.0012 + s.phase) * Math.min(10, d * 0.05);
    if (style === 'pigtails') {
      var out = (G.x < HEAD.cx ? -1 : 1);
      return { x: G.x + out * Math.min(30, d * 0.22) + sway, y: G.y + d * 0.95 };
    }
    if (BEHIND_STYLES[style]) {
      /* Swept over one shoulder, so the end of the tail clears her outline
         and is visible from the front even though it hangs behind her. */
      return { x: G.x + Math.min(290, d * 0.88) + sway, y: G.y + d * 0.7 };
    }
    return { x: G.x + sway, y: G.y + d };
  }

  function applyStyle(s, state) {
    var G = gatherPoint(state.style, s);
    if (!G) { s.braidSide = 0; return; }
    var hold = STYLE_HOLD;
    var i, t, tx, ty, p;

    for (i = 1; i <= Math.min(G.k, s.n); i++) {
      t = i / G.k;
      p = s.pts[i];
      tx = lerp(p.x, G.x, t);
      ty = lerp(p.y, G.y, t);
      p.x += (tx - p.x) * hold * t;
      p.y += (ty - p.y) * hold * t;
    }
    for (i = G.k + 1; i <= s.n; i++) {
      var tgt = tailTarget(state.style, G, i - G.k, s, state.time);
      p = s.pts[i];
      p.x += (tgt.x - p.x) * hold;
      p.y += (tgt.y - p.y) * hold;
    }
    s.braidSide = state.style === 'braid' ? (s.angle < -0.5 ? -1 : s.angle > 0.5 ? 1 : 0) : 0;
  }

  /* ---------- display points (curl, frizz, braid) ---------- */

  function displayPoints(s, time, out) {
    var n = s.n;
    for (var i = 0; i <= n; i++) {
      var p = s.pts[i];
      var ox = 0, oy = 0;
      if (i > 0) {
        var q = s.pts[i - 1];
        var tx = p.x - q.x, ty = p.y - q.y;
        var l = Math.hypot(tx, ty) || 1; tx /= l; ty /= l;
        var ramp = Math.min(1, i / 2.5);
        var amp = s.curl * 14 * ramp;
        var w = Math.sin(i * 1.2 + s.phase);
        ox += -ty * amp * w; oy += tx * amp * w;
        if (s.braidSide !== undefined && s.braidSide !== 0 && i > 6) {
          var bw = Math.sin(i * 0.9 + (s.braidSide > 0 ? 0 : Math.PI)) * 9;
          ox += -ty * bw; oy += tx * bw;
        }
        var fz = s.fz[i] * s.frizz * (1 - s.shine) * 4 * ramp;
        ox += -ty * fz; oy += tx * fz;
      }
      var o = out[i] || (out[i] = { x: 0, y: 0 });
      o.x = p.x + ox; o.y = p.y + oy;
    }
    out.length = n + 1;
    return out;
  }

  /* ---------- tools ---------- */

  function eachNearPoint(strands, x, y, r, fn) {
    var r2 = r * r;
    for (var si = 0; si < strands.length; si++) {
      var s = strands[si];
      for (var i = 1; i <= s.n; i++) {
        var p = s.pts[i];
        var dx = p.x - x, dy = p.y - y;
        var d2 = dx * dx + dy * dy;
        if (d2 < r2) { fn(s, i, p, 1 - Math.sqrt(d2) / r); }
      }
    }
  }

  function brush(state, x, y, dx, dy, r) {
    eachNearPoint(state.strands, x, y, r, function (s, i, p, f) {
      var tip = Math.min(1, i / 4);
      p.x += dx * f * 0.85 * tip;
      p.y += dy * f * 0.85 * tip;
      s.shine = clamp(s.shine + 0.02 * f, 0, 1);
      s.frizz = clamp(s.frizz - 0.035 * f, 0, 1);
    });
  }

  function cut(state, x, y, r) {
    var cutAny = false;
    var strands = state.strands;
    for (var si = 0; si < strands.length; si++) {
      var s = strands[si];
      for (var i = 2; i <= s.n; i++) {
        var p = s.pts[i];
        if (Math.hypot(p.x - x, p.y - y) < r) {
          if (i - 1 < s.n) {
            state.clippings.push({
              x: p.x, y: p.y, vx: rand(-1, 1), vy: rand(-1, 0.4),
              col: s.cols[i - 1], life: 1, rot: rand(0, 6.28)
            });
            s.n = i - 1;
            cutAny = true;
          }
          break;
        }
      }
    }
    return cutAny;
  }

  function grow(state, x, y, r, naturalColor) {
    var grew = false;
    var strands = state.strands;
    for (var si = 0; si < strands.length; si++) {
      var s = strands[si];
      if (s.n >= s.maxN) { continue; }
      var tip = s.pts[s.n];
      if (Math.hypot(tip.x - x, tip.y - y) < r) {
        s.n++;
        var p = s.pts[s.n];
        // The new point sprouts at the tip, not wherever it was left lying,
        // so the strand does not snap across the screen.
        p.x = tip.x + rand(-3, 3);
        p.y = tip.y + 4;
        p.ox = p.x; p.oy = p.y;
        s.cols[s.n - 1] = naturalColor;
        grew = true;
      }
    }
    return grew;
  }

  function dye(state, x, y, r, color) {
    var painted = false;
    eachNearPoint(state.strands, x, y, r, function (s, i, p, f) {
      if (i >= 1 && i <= s.n) { s.cols[i - 1] = color; painted = true; }
      if (i < s.n) { s.cols[i] = color; }
    });
    return painted;
  }

  function curl(state, x, y, r, amount) {
    eachNearPoint(state.strands, x, y, r, function (s, i, p, f) {
      s.curl = clamp(s.curl + amount * f, 0, 1);
    });
  }

  function blow(state, x, y, r, dx, dy) {
    eachNearPoint(state.strands, x, y, r * 1.4, function (s, i, p, f) {
      var tip = Math.min(1, i / 3);
      p.x += dx * f * 0.5 * tip;
      p.y += (dy * 0.5 - 1.5) * f * tip;
      s.frizz = clamp(s.frizz + 0.01 * f, 0, 1);
    });
  }

  function nearestSegment(strands, x, y, maxD) {
    var best = null, bestD = maxD;
    for (var si = 0; si < strands.length; si++) {
      var s = strands[si];
      for (var i = 1; i <= s.n; i++) {
        var p = s.pts[i];
        var d = Math.hypot(p.x - x, p.y - y);
        if (d < bestD) { bestD = d; best = { strand: s, index: i, dist: d }; }
      }
    }
    return best;
  }

  function resetHair(state, color) {
    state.strands = createHair(color);
    state.style = 'down';
    state.clippings.length = 0;
    state.sparkles.length = 0;
    state.accessories.length = 0;
  }

  /* ---------- measurements, used to score a client's request ---------- */

  function measure(state) {
    var s, i, n = 0, curlSum = 0, lenSum = 0, segs = 0;
    var hues = {};
    for (i = 0; i < state.strands.length; i++) {
      s = state.strands[i];
      n++;
      curlSum += s.curl;
      lenSum += s.n / s.maxN;
      for (var c = 0; c < s.n; c++) {
        segs++;
        hues[s.cols[c]] = (hues[s.cols[c]] || 0) + 1;
      }
    }
    var top = null, topN = 0;
    var coverage = {};
    for (var k in hues) {
      coverage[k] = segs ? hues[k] / segs : 0;
      if (hues[k] > topN) { topN = hues[k]; top = k; }
    }
    return {
      curl: n ? curlSum / n : 0,
      length: n ? lenSum / n : 0,
      mainColor: top,
      coverage: coverage,
      style: state.style
    };
  }

  global.Hair = {
    HEAD: HEAD, SHOULDER_Y: SHOULDER_Y, SHOULDER_HALF: SHOULDER_HALF, shoulderAt: shoulderAt, SEGS: SEGS, SEG_LEN: SEG_LEN,
    createHair: createHair, step: step, displayPoints: displayPoints,
    brush: brush, cut: cut, grow: grow, dye: dye, curl: curl, blow: blow,
    nearestSegment: nearestSegment, resetHair: resetHair, measure: measure,
    gatherPoint: gatherPoint, BEHIND_STYLES: BEHIND_STYLES,
    clamp: clamp, lerp: lerp, rand: rand
  };
})(window);
