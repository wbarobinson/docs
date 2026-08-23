/* Ara's Hair Salon - tiny WebAudio noises. No files, everything is synthesised.
   iPad only allows audio to start inside a touch, so unlock() runs on first tap. */
(function (global) {
  'use strict';

  var ctx = null;
  var muted = false;
  try { muted = localStorage.getItem('ara.muted') === '1'; } catch (e) { /* private mode */ }

  function unlock() {
    if (ctx) { if (ctx.state === 'suspended') { ctx.resume(); } return; }
    var AC = global.AudioContext || global.webkitAudioContext;
    if (!AC) { return; }
    ctx = new AC();
    if (ctx.state === 'suspended') { ctx.resume(); }
  }

  function env(node, t, attack, decay, peak) {
    var g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
    node.connect(g);
    g.connect(ctx.destination);
    return g;
  }

  function tone(freq, t, dur, type, peak) {
    var o = ctx.createOscillator();
    o.type = type || 'sine';
    o.frequency.setValueAtTime(freq, t);
    env(o, t, 0.01, dur, peak || 0.13);
    o.start(t);
    o.stop(t + dur + 0.05);
    return o;
  }

  function noise(t, dur, freq, peak) {
    var len = Math.max(1, Math.floor(ctx.sampleRate * dur));
    var buf = ctx.createBuffer(1, len, ctx.sampleRate);
    var data = buf.getChannelData(0);
    for (var i = 0; i < len; i++) { data[i] = (Math.random() * 2 - 1) * (1 - i / len); }
    var src = ctx.createBufferSource();
    src.buffer = buf;
    var f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.setValueAtTime(freq, t);
    src.connect(f);
    env(f, t, 0.005, dur, peak || 0.1);
    src.start(t);
    return src;
  }

  var last = {};
  function throttled(name, ms) {
    var now = (global.performance || Date).now();
    if (last[name] && now - last[name] < ms) { return false; }
    last[name] = now;
    return true;
  }

  var SFX = {
    snip: function (t) { noise(t, 0.05, 3800, 0.12); tone(2100, t + 0.01, 0.04, 'square', 0.05); },
    brush: function (t) { noise(t, 0.12, 900, 0.035); },
    spray: function (t) { noise(t, 0.22, 2200, 0.06); },
    dryer: function (t) { noise(t, 0.18, 700, 0.05); },
    pop: function (t) { tone(520, t, 0.1, 'sine', 0.14); tone(780, t + 0.04, 0.1, 'sine', 0.09); },
    sparkle: function (t) {
      [1320, 1760, 2200].forEach(function (f, i) { tone(f, t + i * 0.055, 0.16, 'triangle', 0.07); });
    },
    shutter: function (t) { noise(t, 0.04, 1500, 0.16); noise(t + 0.07, 0.05, 900, 0.1); },
    cheer: function (t) {
      [523, 659, 784, 1047].forEach(function (f, i) { tone(f, t + i * 0.09, 0.28, 'triangle', 0.11); });
    }
  };

  function play(name, minGap) {
    if (muted || !SFX[name]) { return; }
    unlock();
    if (!ctx) { return; }
    if (minGap && !throttled(name, minGap)) { return; }
    try { SFX[name](ctx.currentTime); } catch (e) { /* audio is a nice-to-have */ }
  }

  global.Sound = {
    play: play,
    unlock: unlock,
    isMuted: function () { return muted; },
    toggle: function () {
      muted = !muted;
      try { localStorage.setItem('ara.muted', muted ? '1' : '0'); } catch (e) { /* ignore */ }
      if (!muted) { play('pop'); }
      return muted;
    }
  };
})(window);
