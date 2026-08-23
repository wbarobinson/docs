/* Ara's Hair Salon - hair rendering.

   The look does not come from drawing hair, it comes from rendering it the way
   hair is actually rendered: every simulated strand stands in for a clump, and
   is drawn as a fan of thin child hairs; each is lit by a single light with a
   diffuse term, and gets the Kajiya-Kay anisotropic highlight that is the
   reason hair reads as hair rather than as ribbon. */
(function (global) {
  'use strict';

  var H = global.Hair;

  function norm3(x, y, z) {
    var l = Math.sqrt(x * x + y * y + z * z) || 1;
    return [x / l, y / l, z / l];
  }

  /* one key light, from above and to her right as we look at her */
  var LIGHT = norm3(-0.42, -0.74, 0.52);
  var L2 = (function () {
    var l = Math.hypot(LIGHT[0], LIGHT[1]) || 1;
    return [LIGHT[0] / l, LIGHT[1] / l];
  })();
  var SPEC_POWER = 26;

  /* Colour maths is the expensive part if done per segment per frame, so both
     the hex parse and the shaded result are memoised into flat lookups. */
  var rgbCache = Object.create(null);
  var shadeCache = Object.create(null);

  function hexRgb(hex) {
    var hit = rgbCache[hex];
    if (hit) { return hit; }
    var h = hex.charAt(0) === '#' ? hex.slice(1) : hex;
    if (h.length === 3) { h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2]; }
    var n = parseInt(h, 16);
    hit = isNaN(n) ? [180, 140, 110] : [(n >> 16) & 255, (n >> 8) & 255, n & 255];
    rgbCache[hex] = hit;
    return hit;
  }

  function shade(hex, mul) {
    var b = Math.round(mul * 16);
    if (b < 0) { b = 0; } else if (b > 32) { b = 32; }
    var key = hex + b;
    var hit = shadeCache[key];
    if (hit) { return hit; }
    var c = hexRgb(hex);
    var m = b / 16;
    hit = 'rgb(' + Math.min(255, Math.round(c[0] * m)) + ',' +
                   Math.min(255, Math.round(c[1] * m)) + ',' +
                   Math.min(255, Math.round(c[2] * m)) + ')';
    shadeCache[key] = hit;
    return hit;
  }

  /* scratch buffers, reused every strand so the loop allocates nothing */
  var px = [], py = [], ox = [], oy = [];

  function tangents(dp, n) {
    for (var i = 0; i <= n; i++) {
      var a = dp[i > 0 ? i - 1 : 0];
      var b = dp[i < n ? i + 1 : n];
      var tx = b.x - a.x, ty = b.y - a.y;
      var l = Math.hypot(tx, ty) || 1;
      px[i] = -ty / l;          // perpendicular, for fanning the child hairs
      py[i] = tx / l;
      ox[i] = tx / l;           // tangent, for the specular term
      oy[i] = ty / l;
    }
  }

  /* Kajiya-Kay: the highlight is strongest where the strand runs across the
     light, which is what puts the band around the crown by itself. */
  function specularAt(i) {
    var d = ox[i] * L2[0] + oy[i] * L2[1];
    var s = 1 - d * d;
    if (s <= 0) { return 0; }
    return Math.pow(Math.sqrt(s), SPEC_POWER);
  }

  function strokeRun(ctx, dp, from, to, off, color, width, alpha) {
    ctx.strokeStyle = color;
    ctx.globalAlpha = alpha;
    ctx.lineWidth = width;
    ctx.beginPath();
    var t0 = taper(from, dp.length - 1);
    ctx.moveTo(dp[from].x + px[from] * off * t0, dp[from].y + py[from] * off * t0);
    for (var i = from + 1; i < to; i++) {
      var t = taper(i, dp.length - 1);
      var t2 = taper(i + 1, dp.length - 1);
      var ax = dp[i].x + px[i] * off * t, ay = dp[i].y + py[i] * off * t;
      var b = dp[i + 1] || dp[i];
      var bx = b.x + px[i + 1 < dp.length ? i + 1 : i] * off * t2;
      var by = b.y + py[i + 1 < dp.length ? i + 1 : i] * off * t2;
      ctx.quadraticCurveTo(ax, ay, (ax + bx) / 2, (ay + by) / 2);
    }
    var tn = taper(to, dp.length - 1);
    ctx.lineTo(dp[to].x + px[to] * off * tn, dp[to].y + py[to] * off * tn);
    ctx.stroke();
  }

  /* child hairs converge at the scalp and spread toward the ends */
  function taper(i, n) {
    var t = n > 0 ? i / n : 0;
    return 0.18 + 0.82 * t;
  }

  function lightAt(a) {
    var n = norm3(Math.sin(a), -0.35, Math.cos(a));
    var d = n[0] * LIGHT[0] + n[1] * LIGHT[1] + n[2] * LIGHT[2];
    if (d < 0) { d = 0; }
    return 0.62 + 0.5 * d;
  }

  function lightOf(s) { return lightAt(s.angle); }

  /* Draw one simulated strand as a clump of `children` thin hairs. */
  function clump(ctx, s, dp, from, to, children, spread) {
    var n = s.n;
    tangents(dp, n);

    var base = lightOf(s) * (0.84 + 0.16 * (1 - s.depth));
    var i, c;

    for (c = 0; c <= children; c++) {
      var mid = children > 0 ? ((c / children) - 0.5) * 2 : 0;
      var jit = s.fz[c % s.fz.length];
      var off = c === 0 ? 0 : (mid + jit * 0.45) * spread;
      /* thin hairs vary in tone, which is most of what stops it reading flat */
      var mul = base * (c === 0 ? 1 : 0.9 + 0.2 * ((jit + 1) / 2));
      var width = c === 0 ? 2.1 : 1.25;
      var alpha = c === 0 ? 0.95 : 0.8;
      var end = c === 0 ? to : Math.max(from + 1, to - (jit > 0.6 ? 1 : 0));

      var run = from;
      for (i = from + 1; i <= end; i++) {
        if (i === end || s.cols[i] !== s.cols[run]) {
          var col = s.cols[run] || s.cols[0];
          /* roots sit in their own shadow */
          var ao = run < 3 ? 0.88 + run * 0.04 : 1;
          strokeRun(ctx, dp, run, i, off, shade(col, mul * ao), width, alpha);
          run = i;
        }
      }
    }

    /* one specular pass per clump, over the segments where it actually peaks */
    var face = Math.cos(s.angle);
    if (to - from > 2 && face > 0) {
      var best = 0, bestI = -1;
      for (i = from + 1; i < to; i++) {
        var sp = specularAt(i);
        if (sp > best) { best = sp; bestI = i; }
      }
      if (bestI > 0 && best > 0.05) {
        var strength = best * face * (0.45 + 0.55 * s.shine);
        var lo = Math.max(from, bestI - 1);
        var hi = Math.min(to, bestI + 1);
        if (hi > lo) {
          var tint = hexRgb(s.cols[Math.min(lo, s.cols.length - 1)] || s.cols[0]);
          ctx.strokeStyle = 'rgb(' +
            Math.min(255, Math.round(tint[0] * 0.35 + 255 * 0.65)) + ',' +
            Math.min(255, Math.round(tint[1] * 0.35 + 255 * 0.65)) + ',' +
            Math.min(255, Math.round(tint[2] * 0.35 + 255 * 0.65)) + ')';
          ctx.globalAlpha = Math.min(0.5, strength * 0.75);
          ctx.lineWidth = spread * 1.5 + 2;
          ctx.beginPath();
          ctx.moveTo(dp[lo].x, dp[lo].y);
          for (i = lo + 1; i <= hi; i++) { ctx.lineTo(dp[i].x, dp[i].y); }
          ctx.stroke();
        }
      }
    }
    ctx.globalAlpha = 1;
  }

  global.Render = {
    clump: clump,
    lightAt: lightAt,
    shade: shade,
    hexRgb: hexRgb,
    LIGHT: LIGHT
  };
})(window);
