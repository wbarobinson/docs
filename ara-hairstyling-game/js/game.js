/* Ara's Hair Salon - drawing, touch handling and the salon loop. */
(function (global) {
  'use strict';

  var H = global.Hair, S = global.Salon, Snd = global.Sound;
  var VW = 1000, VH = 750;
  var HEAD = H.HEAD;
  var clamp = H.clamp, lerp = H.lerp, rand = H.rand;

  var EMOJI_FONT = '"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';

  var canvas, ctx, dpr = 1, scale = 1, offX = 0, offY = 0, cssW = 0, cssH = 0;

  var TOOLS = {
    brush:    { radius: 58, label: 'Brush' },
    scissors: { radius: 26, label: 'Cut' },
    dye:      { radius: 44, label: 'Color' },
    curl:     { radius: 52, label: 'Curl' },
    straight: { radius: 52, label: 'Straight' },
    dryer:    { radius: 84, label: 'Dryer' },
    sparkle:  { radius: 42, label: 'Sparkle' },
    accessory:{ radius: 30, label: 'Bows' },
    style:    { radius: 0,  label: 'Styles' }
  };

  var state = {
    strands: [], style: 'down', accessories: [], sparkles: [], clippings: [],
    confetti: [], volume: 0, time: 0, frame: 0,
    client: null, wishes: [], happy: 0.6, blink: 0, nextBlink: 120,
    tool: 'brush', color: S.COLORS[0].css, accessory: S.ACCESSORIES[0],
    pointer: { x: 500, y: 300, active: false },
    undo: []
  };

  var pointers = new Map();
  var dispBuf = [];

  /* ---------- setup ---------- */

  function resize() {
    cssW = global.innerWidth;
    cssH = global.innerHeight;
    dpr = Math.min(global.devicePixelRatio || 1, 2);
    canvas.width = Math.floor(cssW * dpr);
    canvas.height = Math.floor(cssH * dpr);
    canvas.style.width = cssW + 'px';
    canvas.style.height = cssH + 'px';
    scale = Math.min(cssW / VW, cssH / VH);
    offX = (cssW - VW * scale) / 2;
    offY = (cssH - VH * scale) / 2;
  }

  function toVirtual(clientX, clientY) {
    return { x: (clientX - offX) / scale, y: (clientY - offY) / scale };
  }

  /* ---------- clients ---------- */

  function newClient(which) {
    var c = which || S.CLIENTS[Math.floor(Math.random() * S.CLIENTS.length)];
    state.client = c;
    state.wishes = S.makeRequest(Math.random);
    H.resetHair(state, c.hair);
    state.confetti.length = 0;
    state.undo.length = 0;
    state.happy = 0.6;
    UI.renderRequest();
    Snd.play('pop');
  }

  /* ---------- undo ---------- */

  function snapshot() {
    var snap = { n: [], cols: [], curl: [], style: state.style, acc: JSON.stringify(state.accessories) };
    for (var i = 0; i < state.strands.length; i++) {
      var s = state.strands[i];
      snap.n.push(s.n);
      snap.cols.push(s.cols.slice());
      snap.curl.push(s.curl);
    }
    state.undo.push(snap);
    if (state.undo.length > 20) { state.undo.shift(); }
  }

  function undo() {
    var snap = state.undo.pop();
    if (!snap) { return false; }
    for (var i = 0; i < state.strands.length; i++) {
      var s = state.strands[i];
      s.n = snap.n[i];
      s.cols = snap.cols[i].slice();
      s.curl = snap.curl[i];
    }
    state.style = snap.style;
    state.accessories = JSON.parse(snap.acc);
    Snd.play('pop');
    return true;
  }

  /* ---------- tools ---------- */

  function applyTool(p, dx, dy, isDown) {
    var t = state.tool;
    var r = TOOLS[t].radius;
    if (t === 'brush') {
      H.brush(state, p.x, p.y, dx, dy, r);
      if (Math.hypot(dx, dy) > 2) { Snd.play('brush', 140); }
    } else if (t === 'scissors') {
      if (H.cut(state, p.x, p.y, r)) { Snd.play('snip', 60); }
    } else if (t === 'dye') {
      if (H.dye(state, p.x, p.y, r, state.color)) { Snd.play('spray', 220); }
    } else if (t === 'curl') {
      H.curl(state, p.x, p.y, r, 0.05);
      Snd.play('spray', 300);
    } else if (t === 'straight') {
      H.curl(state, p.x, p.y, r, -0.06);
      H.brush(state, p.x, p.y, dx * 0.5, dy * 0.5, r);
      Snd.play('brush', 200);
    } else if (t === 'dryer') {
      H.blow(state, p.x, p.y, r, dx, dy);
      state.volume = Math.min(1, state.volume + 0.03);
      Snd.play('dryer', 180);
    } else if (t === 'sparkle') {
      addSparkle(p.x, p.y);
    } else if (t === 'accessory' && isDown) {
      placeAccessory(p.x, p.y);
    }
  }

  function addSparkle(x, y) {
    var hit = H.nearestSegment(state.strands, x, y, 40);
    if (!hit) { return; }
    if (state.sparkles.length > 90) { state.sparkles.shift(); }
    state.sparkles.push({
      strand: hit.strand, index: hit.index,
      dx: rand(-6, 6), dy: rand(-6, 6),
      size: rand(13, 22), phase: rand(0, 6.28)
    });
    Snd.play('sparkle', 260);
  }

  function placeAccessory(x, y) {
    var hit = H.nearestSegment(state.strands, x, y, 90);
    if (!hit) { return; }
    var p = hit.strand.pts[hit.index];
    state.accessories.push({
      emoji: state.accessory,
      si: state.strands.indexOf(hit.strand),
      index: hit.index,
      dx: x - p.x, dy: y - p.y,
      size: 54, rot: rand(-0.18, 0.18)
    });
    Snd.play('pop');
  }

  function accessoryPos(a) {
    var s = state.strands[a.si];
    if (!s) { return null; }
    var i = Math.min(a.index, s.n);
    var p = s.pts[i];
    return { x: p.x + a.dx, y: p.y + a.dy };
  }

  /* ---------- input ---------- */

  function bindInput() {
    var opts = { passive: false };

    canvas.addEventListener('pointerdown', function (e) {
      e.preventDefault();
      Snd.unlock();
      var p = toVirtual(e.clientX, e.clientY);
      pointers.set(e.pointerId, { x: p.x, y: p.y });
      state.pointer.x = p.x; state.pointer.y = p.y; state.pointer.active = true;
      if (pointers.size === 1) { snapshot(); }
      applyTool(p, 0, 0, true);
      if (canvas.setPointerCapture) { canvas.setPointerCapture(e.pointerId); }
      UI.closeTray();
    }, opts);

    canvas.addEventListener('pointermove', function (e) {
      var prev = pointers.get(e.pointerId);
      var p = toVirtual(e.clientX, e.clientY);
      state.pointer.x = p.x; state.pointer.y = p.y;
      if (!prev) { return; }
      e.preventDefault();
      applyTool(p, p.x - prev.x, p.y - prev.y, false);
      prev.x = p.x; prev.y = p.y;
    }, opts);

    function end(e) {
      pointers.delete(e.pointerId);
      if (pointers.size === 0) { state.pointer.active = false; }
    }
    canvas.addEventListener('pointerup', end);
    canvas.addEventListener('pointercancel', end);
    canvas.addEventListener('pointerleave', end);

    /* iPad: stop pinch-zoom and double-tap-zoom from fighting the game */
    ['gesturestart', 'gesturechange', 'gestureend'].forEach(function (n) {
      document.addEventListener(n, function (e) { e.preventDefault(); }, opts);
    });
    document.addEventListener('touchmove', function (e) {
      if (e.touches.length > 1) { e.preventDefault(); }
    }, opts);
  }

  /* ---------- drawing: the model ---------- */

  function drawBackdrop() {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    var g = ctx.createLinearGradient(0, 0, 0, cssH);
    g.addColorStop(0, '#ffe9f4');
    g.addColorStop(0.55, '#ffd9ec');
    g.addColorStop(1, '#f7c9e4');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, cssW, cssH);

    ctx.setTransform(dpr * scale, 0, 0, dpr * scale, dpr * offX, dpr * offY);

    /* mirror behind the chair */
    ctx.save();
    ctx.globalAlpha = 0.55;
    ctx.fillStyle = '#fff6fb';
    roundRect(VW / 2 - 250, 40, 500, 470, 250);
    ctx.fill();
    ctx.lineWidth = 14;
    ctx.strokeStyle = '#ffb3d9';
    ctx.stroke();
    ctx.restore();

    /* floor */
    ctx.fillStyle = '#f3b9dd';
    ctx.fillRect(-1000, 604, 3000, VH + 400);
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    for (var i = -10; i < 30; i++) {
      ctx.fillRect(-1000 + i * 120, 604, 60, VH + 400);
    }
  }

  function roundRect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function drawBody() {
    var c = state.client;
    var topY = H.SHOULDER_Y;
    var midY = topY + 165;

    /* neck runs behind the shoulders so there is never a gap */
    ctx.fillStyle = c.skin2;
    roundRect(HEAD.cx - 38, HEAD.cy + HEAD.ry - 66, 76, (topY + 50) - (HEAD.cy + HEAD.ry - 66), 30);
    ctx.fill();

    ctx.fillStyle = c.shirt;
    ctx.beginPath();
    ctx.ellipse(HEAD.cx, midY, H.SHOULDER_HALF, midY - topY, 0, Math.PI, Math.PI * 2);
    ctx.fill();
    ctx.fillRect(HEAD.cx - H.SHOULDER_HALF, midY, H.SHOULDER_HALF * 2, 3000);

    /* collar */
    ctx.fillStyle = 'rgba(255,255,255,0.28)';
    ctx.beginPath();
    ctx.ellipse(HEAD.cx, topY + 6, 64, 34, 0, 0, Math.PI);
    ctx.fill();
  }

  function drawHead() {
    var c = state.client;

    ctx.fillStyle = c.skin;
    ctx.beginPath();
    ctx.ellipse(HEAD.cx - HEAD.rx + 6, HEAD.cy + 22, 17, 24, 0, 0, 6.2832);
    ctx.ellipse(HEAD.cx + HEAD.rx - 6, HEAD.cy + 22, 17, 24, 0, 0, 6.2832);
    ctx.fill();

    ctx.beginPath();
    ctx.ellipse(HEAD.cx, HEAD.cy, HEAD.rx, HEAD.ry, 0, 0, 6.2832);
    ctx.fill();

    ctx.fillStyle = 'rgba(255,255,255,0.09)';
    ctx.beginPath();
    ctx.ellipse(HEAD.cx - 34, HEAD.cy - 24, 34, 42, -0.3, 0, 6.2832);
    ctx.fill();
  }

  function drawFace() {
    var c = state.client;
    var lookX = clamp((state.pointer.x - HEAD.cx) / 340, -1, 1) * 5;
    var lookY = clamp((state.pointer.y - HEAD.cy) / 340, -1, 1) * 4;
    var open = state.blink > 0 ? 0.12 : 1;
    var eyes = [[HEAD.cx - 40, HEAD.cy + 14], [HEAD.cx + 40, HEAD.cy + 14]];

    ctx.save();
    ctx.fillStyle = c.blush;
    ctx.globalAlpha = 0.4;
    ctx.beginPath();
    ctx.ellipse(HEAD.cx - 68, HEAD.cy + 46, 22, 13, 0, 0, 6.2832);
    ctx.ellipse(HEAD.cx + 68, HEAD.cy + 46, 22, 13, 0, 0, 6.2832);
    ctx.fill();
    ctx.restore();

    eyes.forEach(function (e) {
      ctx.fillStyle = '#fffdf9';
      ctx.beginPath();
      ctx.ellipse(e[0], e[1], 21, 20 * open, 0, 0, 6.2832);
      ctx.fill();

      ctx.fillStyle = c.eye;
      ctx.beginPath();
      ctx.ellipse(e[0] + lookX, e[1] + lookY, 12, 13 * open, 0, 0, 6.2832);
      ctx.fill();

      ctx.fillStyle = '#20161a';
      ctx.beginPath();
      ctx.ellipse(e[0] + lookX, e[1] + lookY, 6, 7 * open, 0, 0, 6.2832);
      ctx.fill();

      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.ellipse(e[0] + lookX - 5, e[1] + lookY - 6 * open, 4, 4 * open, 0, 0, 6.2832);
      ctx.fill();

      ctx.strokeStyle = 'rgba(60,40,45,0.6)';
      ctx.lineWidth = 3;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.arc(e[0], e[1] - 4, 21, Math.PI * 1.25, Math.PI * 1.75);
      ctx.stroke();
    });

    /* brows */
    ctx.strokeStyle = 'rgba(90,60,50,0.7)';
    ctx.lineWidth = 5;
    ctx.lineCap = 'round';
    [-1, 1].forEach(function (side) {
      ctx.beginPath();
      ctx.arc(HEAD.cx + side * 40, HEAD.cy - 20, 25, Math.PI * 1.22, Math.PI * 1.78);
      ctx.stroke();
    });

    /* nose */
    ctx.strokeStyle = 'rgba(150,100,85,0.55)';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(HEAD.cx - 4, HEAD.cy + 46);
    ctx.quadraticCurveTo(HEAD.cx + 5, HEAD.cy + 54, HEAD.cx - 3, HEAD.cy + 58);
    ctx.stroke();

    /* mouth - widens as the client gets what she asked for */
    var smile = 0.35 + state.happy * 0.65;
    ctx.strokeStyle = '#c4535e';
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.moveTo(HEAD.cx - 24, HEAD.cy + 76);
    ctx.quadraticCurveTo(HEAD.cx, HEAD.cy + 76 + 26 * smile, HEAD.cx + 24, HEAD.cy + 76);
    ctx.stroke();
    if (smile > 0.75) {
      ctx.fillStyle = '#e98c9a';
      ctx.beginPath();
      ctx.moveTo(HEAD.cx - 22, HEAD.cy + 77);
      ctx.quadraticCurveTo(HEAD.cx, HEAD.cy + 77 + 24 * smile, HEAD.cx + 22, HEAD.cy + 77);
      ctx.fill();
    }
  }

  function drawScalp() {
    /* a cap made of little wedges, each tinted by its own strand's root colour,
       so dyeing the roots actually shows */
    var strands = state.strands;
    for (var i = 0; i < strands.length; i++) {
      var s = strands[i];
      if (s.layer !== 'front') { continue; }
      var a = s.angle, d = 0.075;
      ctx.fillStyle = s.cols[0];
      ctx.beginPath();
      ctx.moveTo(HEAD.cx + Math.sin(a - d) * HEAD.rx, HEAD.cy - Math.cos(a - d) * HEAD.ry);
      ctx.lineTo(HEAD.cx + Math.sin(a + d) * HEAD.rx, HEAD.cy - Math.cos(a + d) * HEAD.ry);
      ctx.lineTo(HEAD.cx + Math.sin(a + d) * HEAD.rx * 0.55, HEAD.cy - Math.cos(a + d) * HEAD.ry * 0.55 + 10);
      ctx.lineTo(HEAD.cx + Math.sin(a - d) * HEAD.rx * 0.55, HEAD.cy - Math.cos(a - d) * HEAD.ry * 0.55 + 10);
      ctx.closePath();
      ctx.fill();
    }
  }

  /* ---------- drawing: hair ---------- */

  function strokeRun(dp, from, to, color, width, alpha) {
    if (to <= from) { return; }
    ctx.strokeStyle = color;
    ctx.globalAlpha = alpha;
    ctx.lineWidth = width;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(dp[from].x, dp[from].y);
    for (var i = from + 1; i < to; i++) {
      var a = dp[i], b = dp[i + 1] || dp[i];
      ctx.quadraticCurveTo(a.x, a.y, (a.x + b.x) / 2, (a.y + b.y) / 2);
    }
    ctx.lineTo(dp[to].x, dp[to].y);
    ctx.stroke();
  }

  function drawStrand(s) {
    if (s.n < 1) { return; }
    var dp = H.displayPoints(s, state.time, dispBuf);
    var shade = 0.75 + (1 - s.depth) * 0.25;
    var run = 0;
    for (var i = 1; i <= s.n; i++) {
      if (i === s.n || s.cols[i] !== s.cols[run]) {
        var w = lerp(s.width, s.width * 0.42, run / s.n);
        strokeRun(dp, run, i, s.cols[run] || s.cols[0], w, shade);
        run = i;
      }
    }

    /* shine ribbon near the roots */
    if (s.shine > 0.45 && s.n > 3) {
      ctx.globalAlpha = (s.shine - 0.45) * 0.5;
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = s.width * 0.3;
      ctx.beginPath();
      ctx.moveTo(dp[1].x, dp[1].y);
      for (var k = 2; k <= Math.min(s.n, 5); k++) { ctx.lineTo(dp[k].x, dp[k].y); }
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  function drawHair(layer) {
    for (var i = 0; i < state.strands.length; i++) {
      if (state.strands[i].layer === layer) { drawStrand(state.strands[i]); }
    }
  }

  /* ---------- drawing: extras ---------- */

  function drawAccessories() {
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (var i = 0; i < state.accessories.length; i++) {
      var a = state.accessories[i];
      var p = accessoryPos(a);
      if (!p) { continue; }
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(a.rot);
      ctx.font = a.size + 'px ' + EMOJI_FONT;
      ctx.fillText(a.emoji, 0, 0);
      ctx.restore();
    }
  }

  function drawSparkles() {
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (var i = 0; i < state.sparkles.length; i++) {
      var sp = state.sparkles[i];
      var s = sp.strand;
      var idx = Math.min(sp.index, s.n);
      if (idx < 1) { continue; }
      var p = s.pts[idx];
      var tw = 0.55 + 0.45 * Math.sin(state.time * 0.005 + sp.phase);
      ctx.globalAlpha = tw;
      ctx.font = sp.size + 'px ' + EMOJI_FONT;
      ctx.fillText('✨', p.x + sp.dx, p.y + sp.dy);
    }
    ctx.globalAlpha = 1;
  }

  function drawClippings() {
    for (var i = state.clippings.length - 1; i >= 0; i--) {
      var c = state.clippings[i];
      c.vy += 0.45;
      c.x += c.vx; c.y += c.vy;
      c.rot += 0.08;
      c.life -= 0.012;
      if (c.life <= 0 || c.y > VH + 60) { state.clippings.splice(i, 1); continue; }
      ctx.save();
      ctx.globalAlpha = Math.max(0, c.life);
      ctx.translate(c.x, c.y);
      ctx.rotate(c.rot);
      ctx.strokeStyle = c.col;
      ctx.lineWidth = 5;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(-11, 0);
      ctx.quadraticCurveTo(0, 6, 11, 0);
      ctx.stroke();
      ctx.restore();
    }
  }

  function drawConfetti() {
    for (var i = state.confetti.length - 1; i >= 0; i--) {
      var c = state.confetti[i];
      c.vy += 0.16;
      c.x += c.vx; c.y += c.vy; c.rot += c.spin;
      c.life -= 0.008;
      if (c.life <= 0 || c.y > VH + 40) { state.confetti.splice(i, 1); continue; }
      ctx.save();
      ctx.globalAlpha = Math.max(0, Math.min(1, c.life));
      ctx.translate(c.x, c.y);
      ctx.rotate(c.rot);
      ctx.fillStyle = c.col;
      ctx.fillRect(-7, -4, 14, 8);
      ctx.restore();
    }
  }

  function burstConfetti() {
    for (var i = 0; i < 90; i++) {
      state.confetti.push({
        x: rand(120, VW - 120), y: rand(-160, -10),
        vx: rand(-2, 2), vy: rand(0, 3),
        rot: rand(0, 6.28), spin: rand(-0.2, 0.2), life: 1.6,
        col: S.COLORS[Math.floor(Math.random() * S.COLORS.length)].css
      });
    }
  }

  function drawCursor() {
    if (!state.pointer.active || state.tool === 'style') { return; }
    var r = TOOLS[state.tool].radius;
    if (!r) { return; }
    ctx.save();
    ctx.globalAlpha = 0.28;
    ctx.fillStyle = state.tool === 'dye' ? state.color : '#ffffff';
    ctx.beginPath();
    ctx.arc(state.pointer.x, state.pointer.y, r, 0, 6.2832);
    ctx.fill();
    ctx.restore();
  }

  /* ---------- loop ---------- */

  function updateHappiness() {
    var m = H.measure(state);
    var r = S.score(state.wishes, m, state.accessories);
    state.happy = state.wishes.length ? r.got / state.wishes.length : 1;
    UI.markWishes(m);
  }

  function frame(t) {
    state.time = t;
    state.frame++;
    state.volume *= 0.985;

    if (--state.nextBlink <= 0) {
      state.blink = 8;
      state.nextBlink = 120 + Math.floor(Math.random() * 260);
    }
    if (state.blink > 0) { state.blink--; }
    if (state.frame % 20 === 0) { updateHappiness(); }

    H.step(state);

    drawBackdrop();
    drawHair('back');
    drawBody();
    drawHead();
    drawFace();
    drawScalp();
    drawHair('front');
    drawAccessories();
    drawSparkles();
    drawClippings();
    drawConfetti();
    drawCursor();

    requestAnimationFrame(frame);
  }

  /* ---------- photo ---------- */

  function takePhoto() {
    var m = H.measure(state);
    var res = S.score(state.wishes, m, state.accessories);
    Snd.play('shutter');
    setTimeout(function () { Snd.play('cheer'); }, 260);
    burstConfetti();

    var pw = 720, ph = 940;
    var pc = document.createElement('canvas');
    pc.width = pw; pc.height = ph;
    var p = pc.getContext('2d');

    p.fillStyle = '#fffdf7';
    p.fillRect(0, 0, pw, ph);

    /* the picture itself: the salon canvas, cropped around the model */
    var cropW = 500, cropH = 540, cropX = HEAD.cx - cropW / 2, cropY = 110;
    p.save();
    p.beginPath();
    p.rect(36, 36, pw - 72, 700);
    p.clip();
    p.translate(36, 36);
    p.scale((pw - 72) / cropW, 700 / cropH);
    p.translate(-cropX, -cropY);
    p.drawImage(canvas, offX * dpr, offY * dpr, VW * scale * dpr, VH * scale * dpr, 0, 0, VW, VH);
    p.restore();

    p.strokeStyle = '#ffb3d9';
    p.lineWidth = 8;
    p.strokeRect(36, 36, pw - 72, 700);

    p.fillStyle = '#c2417f';
    p.textAlign = 'center';
    p.font = 'bold 54px "Baloo 2", "Trebuchet MS", sans-serif';
    p.fillText(state.client.name, pw / 2, 810);

    p.font = '58px ' + EMOJI_FONT;
    var stars = '';
    for (var i = 0; i < res.stars; i++) { stars += '⭐'; }
    p.fillText(stars, pw / 2, 880);

    p.fillStyle = '#8a6b7d';
    p.font = '28px "Trebuchet MS", sans-serif';
    p.fillText("styled by Ara", pw / 2, 918);

    var data = pc.toDataURL('image/jpeg', 0.8);
    UI.showPhoto(data, res);
    return data;
  }

  /* ---------- sticker book (saved photos) ---------- */

  var Gallery = {
    key: 'ara.gallery',
    all: function () {
      try { return JSON.parse(localStorage.getItem(this.key) || '[]'); }
      catch (e) { return []; }
    },
    add: function (data) {
      var list = this.all();
      list.unshift(data);
      while (list.length > 8) { list.pop(); }
      try { localStorage.setItem(this.key, JSON.stringify(list)); }
      catch (e) {
        list = list.slice(0, 4);
        try { localStorage.setItem(this.key, JSON.stringify(list)); } catch (e2) { /* full */ }
      }
      return list;
    },
    clear: function () {
      try { localStorage.removeItem(this.key); } catch (e) { /* ignore */ }
    }
  };

  /* ---------- UI ---------- */

  var UI = {
    init: function () {
      var self = this;
      this.tray = document.getElementById('tray');
      this.request = document.getElementById('request');
      this.photoView = document.getElementById('photo-view');
      this.photoImg = document.getElementById('photo-img');
      this.bookView = document.getElementById('book-view');
      this.bookGrid = document.getElementById('book-grid');
      this.clientView = document.getElementById('client-view');
      this.clientGrid = document.getElementById('client-grid');

      document.querySelectorAll('[data-tool]').forEach(function (btn) {
        btn.addEventListener('click', function () {
          self.selectTool(btn.getAttribute('data-tool'));
        });
      });

      document.getElementById('btn-undo').addEventListener('click', function () {
        if (!undo()) { self.toast('Nothing to undo'); }
      });
      document.getElementById('btn-photo').addEventListener('click', takePhoto);
      document.getElementById('btn-book').addEventListener('click', function () { self.showBook(); });
      document.getElementById('btn-clients').addEventListener('click', function () { self.showClients(); });
      document.getElementById('btn-wash').addEventListener('click', function () {
        snapshot();
        H.resetHair(state, state.client.hair);
        Snd.play('spray');
        self.toast('All washed out!');
      });
      var sound = document.getElementById('btn-sound');
      sound.textContent = Snd.isMuted() ? '🔇' : '🔊';
      sound.addEventListener('click', function () {
        sound.textContent = Snd.toggle() ? '🔇' : '🔊';
      });

      document.getElementById('photo-again').addEventListener('click', function () {
        self.photoView.classList.remove('show');
      });
      document.getElementById('photo-save').addEventListener('click', function () {
        Gallery.add(self.photoImg.src);
        Snd.play('sparkle');
        self.toast('Saved to your sticker book!');
        self.photoView.classList.remove('show');
      });
      document.getElementById('photo-next').addEventListener('click', function () {
        Gallery.add(self.photoImg.src);
        self.photoView.classList.remove('show');
        newClient();
      });
      document.getElementById('book-close').addEventListener('click', function () {
        self.bookView.classList.remove('show');
      });
      document.getElementById('book-clear').addEventListener('click', function () {
        Gallery.clear();
        self.showBook();
      });
      document.getElementById('client-close').addEventListener('click', function () {
        self.clientView.classList.remove('show');
      });

      this.buildTrays();
      this.selectTool('brush');
    },

    buildTrays: function () {
      var self = this;
      var colors = document.getElementById('tray-dye');
      S.COLORS.forEach(function (c) {
        var b = document.createElement('button');
        b.className = 'swatch';
        b.style.background = c.css;
        b.title = c.name;
        b.setAttribute('aria-label', c.name);
        b.addEventListener('click', function () {
          state.color = c.css;
          colors.querySelectorAll('.swatch').forEach(function (o) { o.classList.remove('on'); });
          b.classList.add('on');
          Snd.play('pop');
        });
        colors.appendChild(b);
      });
      colors.firstChild.classList.add('on');

      var accs = document.getElementById('tray-accessory');
      S.ACCESSORIES.forEach(function (e) {
        var b = document.createElement('button');
        b.className = 'chip';
        b.textContent = e;
        b.addEventListener('click', function () {
          state.accessory = e;
          accs.querySelectorAll('.chip').forEach(function (o) { o.classList.remove('on'); });
          b.classList.add('on');
          Snd.play('pop');
        });
        accs.appendChild(b);
      });
      accs.firstChild.classList.add('on');
      var clearAcc = document.createElement('button');
      clearAcc.className = 'chip wide';
      clearAcc.textContent = '🗑️';
      clearAcc.addEventListener('click', function () {
        snapshot();
        state.accessories.length = 0;
        Snd.play('pop');
      });
      accs.appendChild(clearAcc);

      var styles = document.getElementById('tray-style');
      S.STYLES.forEach(function (st) {
        var b = document.createElement('button');
        b.className = 'chip labeled';
        b.innerHTML = '<span>' + st.icon + '</span><em>' + st.label + '</em>';
        b.addEventListener('click', function () {
          snapshot();
          state.style = st.id;
          styles.querySelectorAll('.chip').forEach(function (o) { o.classList.remove('on'); });
          b.classList.add('on');
          Snd.play('sparkle');
        });
        styles.appendChild(b);
      });
      styles.firstChild.classList.add('on');

      S.CLIENTS.forEach(function (c) {
        var b = document.createElement('button');
        b.className = 'chip labeled tall';
        b.innerHTML = '<span class="face" style="background:' + c.skin + '"></span><em>' + c.name + '</em>';
        b.addEventListener('click', function () {
          self.clientView.classList.remove('show');
          newClient(c);
        });
        self.clientGrid.appendChild(b);
      });
    },

    selectTool: function (tool) {
      state.tool = tool;
      document.querySelectorAll('[data-tool]').forEach(function (b) {
        b.classList.toggle('on', b.getAttribute('data-tool') === tool);
      });
      var trays = ['dye', 'accessory', 'style'];
      var open = trays.indexOf(tool) >= 0;
      this.tray.classList.toggle('show', open);
      trays.forEach(function (t) {
        document.getElementById('tray-' + t).classList.toggle('show', t === tool);
      });
      Snd.play('pop');
    },

    closeTray: function () { /* keep the tray open while styling - it is handy */ },

    renderRequest: function () {
      var c = state.client;
      var html = '<span class="who">' + c.name + ' wants</span>';
      state.wishes.forEach(function (w, i) {
        html += '<span class="wish" data-i="' + i + '">' + w.icon + ' ' + w.label + '</span>';
      });
      this.request.innerHTML = html;
    },

    markWishes: function (m) {
      var nodes = this.request.querySelectorAll('.wish');
      for (var i = 0; i < nodes.length; i++) {
        var w = state.wishes[i];
        if (!w) { continue; }
        var done = false;
        if (w.kind === 'color') { done = m.mainColor === w.value; }
        else if (w.kind === 'curl') { done = m.curl >= 0.35; }
        else if (w.kind === 'straight') { done = m.curl <= 0.25; }
        else if (w.kind === 'style') { done = m.style === w.value; }
        else if (w.kind === 'short') { done = m.length <= 0.8; }
        else if (w.kind === 'accessory') {
          done = state.accessories.some(function (a) { return a.emoji === w.value; });
        }
        nodes[i].classList.toggle('done', done);
      }
    },

    showPhoto: function (data, res) {
      this.photoImg.src = data;
      document.getElementById('photo-stars').textContent =
        new Array(res.stars + 1).join('⭐');
      this.photoView.classList.add('show');
    },

    showBook: function () {
      var list = Gallery.all();
      this.bookGrid.innerHTML = list.length
        ? ''
        : '<p class="empty">No photos yet. Style someone, then tap 📸!</p>';
      list.forEach(function (src) {
        var img = document.createElement('img');
        img.src = src;
        this.bookGrid.appendChild(img);
      }, this);
      this.bookView.classList.add('show');
    },

    showClients: function () {
      this.clientView.classList.add('show');
    },

    toast: function (msg) {
      var t = document.getElementById('toast');
      t.textContent = msg;
      t.classList.add('show');
      clearTimeout(t._timer);
      t._timer = setTimeout(function () { t.classList.remove('show'); }, 1600);
    }
  };

  /* ---------- boot ---------- */

  function start() {
    canvas = document.getElementById('salon');
    ctx = canvas.getContext('2d');
    resize();
    global.addEventListener('resize', resize);
    global.addEventListener('orientationchange', function () { setTimeout(resize, 120); });
    UI.init();
    bindInput();
    newClient(S.CLIENTS[0]);
    requestAnimationFrame(frame);
  }

  global.Game = { start: start, state: state, takePhoto: takePhoto, newClient: newClient };
})(window);
