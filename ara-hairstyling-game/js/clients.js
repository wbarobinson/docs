/* Ara's Hair Salon - the clients who come in, and the looks they ask for. */
(function (global) {
  'use strict';

  var W = global.SalonWords || {};

  var FALLBACK_COLORS = [
    { name: 'bubblegum', css: '#ff7ab8' },
    { name: 'cotton candy', css: '#ffb3d9' },
    { name: 'lavender', css: '#b98cf5' },
    { name: 'ocean', css: '#4bc4e8' },
    { name: 'mint', css: '#5fdcb0' },
    { name: 'sunshine', css: '#ffd23f' },
    { name: 'tangerine', css: '#ff9147' },
    { name: 'cherry', css: '#f0473f' },
    { name: 'berry', css: '#8e3bb0' },
    { name: 'midnight', css: '#2f2b45' },
    { name: 'chocolate', css: '#5c3823' },
    { name: 'caramel', css: '#a4692f' },
    { name: 'honey', css: '#d9a441' },
    { name: 'strawberry', css: '#c4522c' },
    { name: 'silver', css: '#c9cede' },
    { name: 'snow', css: '#f2eee6' }
  ];

  var COLORS = (W.colors && W.colors.length ? W.colors : FALLBACK_COLORS).map(function (x) {
    return { name: x.name, css: x.css };
  });

  var FALLBACK_ACCESSORIES = [
    { emoji: '🎀', word: 'bow', level: 2, category: 'starter' },
    { emoji: '🌸', word: 'flower', level: 3, category: 'starter' },
    { emoji: '👑', word: 'crown', level: 2, category: 'starter' },
    { emoji: '⭐', word: 'star', level: 2, category: 'starter' },
    { emoji: '🦋', word: 'butterfly', level: 4, category: 'starter' },
    { emoji: '❤️', word: 'heart', level: 2, category: 'starter' }
  ];
  var ACCESSORIES = (W.accessories && W.accessories.length ? W.accessories : FALLBACK_ACCESSORIES);

  /* Accessory packs open as stars pile up. Thresholds are tuned to a
     five-year-old earning roughly 20-40 stars in a sitting: two packs open on
     day one, then about one a day after that. */
  var PACKS = [
    { id: 'starter', name: 'Starter', stars: 0 },
    { id: 'garden', name: 'Garden', stars: 15 },
    { id: 'animals', name: 'Animals', stars: 35 },
    { id: 'ocean', name: 'Ocean', stars: 60 },
    { id: 'sweets', name: 'Sweets', stars: 95 },
    { id: 'sky', name: 'Sky', stars: 140 },
    { id: 'treasure', name: 'Treasure', stars: 200 }
  ];

  function unlockedPacks(stars) {
    return PACKS.filter(function (p) { return stars >= p.stars; }).map(function (p) { return p.id; });
  }

  function unlockedAccessories(stars) {
    var open = unlockedPacks(stars);
    var out = ACCESSORIES.filter(function (a) { return open.indexOf(a.category) >= 0; });
    return out.length ? out : ACCESSORIES.slice(0, 8);
  }

  var STYLES = [
    { id: 'down', label: 'Down', icon: '💇' },
    { id: 'ponytail', label: 'Ponytail', icon: '🐴' },
    { id: 'highpony', label: 'High pony', icon: '⬆️' },
    { id: 'pigtails', label: 'Pigtails', icon: '👧' },
    { id: 'bun', label: 'Bun', icon: '🧁' },
    { id: 'braid', label: 'Braid', icon: '🪢' },
    { id: 'halfup', label: 'Half up', icon: '🎗️' }
  ];

  var EXTRA_CLIENTS = (W.clients || []);
  var CLIENTS = [
    { name: 'Poppy', skin: '#f6cfae', skin2: '#e3b191', hair: '#5c3823', eye: '#4a6b3a', shirt: '#ff8fb1', blush: '#ff9aa8' },
    { name: 'Nia', skin: '#8a5a3b', skin2: '#764930', hair: '#2f2b45', eye: '#3b2a1e', shirt: '#7ad3c0', blush: '#c4726a' },
    { name: 'Mei', skin: '#f0d3b4', skin2: '#dcb593', hair: '#2f2b45', eye: '#3a2b22', shirt: '#b98cf5', blush: '#ef9a9a' },
    { name: 'Isla', skin: '#fbe0cd', skin2: '#eec3a8', hair: '#d9a441', eye: '#4d7fa8', shirt: '#ffd23f', blush: '#ffa0a8' },
    { name: 'Zuri', skin: '#6d4429', skin2: '#5a3720', hair: '#3a2418', eye: '#3b2a1e', shirt: '#4bc4e8', blush: '#b8655c' },
    { name: 'Ava', skin: '#e8b78f', skin2: '#d29e76', hair: '#a4692f', eye: '#5c8a5c', shirt: '#5fdcb0', blush: '#e08a86' }
  ].concat(EXTRA_CLIENTS);

  /* A request is 1-3 wishes. Every wish is a short reading moment: the chip
     shows the word, and the matching emoji lives in the trays. Words lean on
     the reader's level so the request is decodable, not decoration. */
  function makeRequest(rnd, opts) {
    opts = opts || {};
    var stars = opts.stars || 0;
    var level = opts.level || 1;
    var pick = function (arr) { return arr[Math.floor(rnd() * arr.length)]; };
    var wishes = [];

    var wordLevel = function (w) { return w.length <= 3 ? 1 : w.length <= 5 ? 2 : 3; };
    var easyColors = COLORS.filter(function (x) { return wordLevel(x.name) <= level + 1; });
    var color = pick(easyColors.length >= 4 ? easyColors : COLORS);
    wishes.push({ kind: 'color', value: color.css, label: color.name, suffix: ' hair', icon: '🎨' });

    var roll = rnd();
    if (roll < 0.45) {
      wishes.push({ kind: 'curl', value: 0.6, label: 'curly', suffix: '', icon: '🌀' });
    } else if (roll < 0.7) {
      wishes.push({ kind: 'straight', value: 0.2, label: 'straight', suffix: '', icon: '💧' });
    }

    if (rnd() < 0.6) {
      var st = STYLES[1 + Math.floor(rnd() * (STYLES.length - 1))];
      wishes.push({ kind: 'style', value: st.id, label: st.label.toLowerCase(), suffix: '', icon: st.icon });
    }
    if (rnd() < 0.75) {
      var pool = unlockedAccessories(stars);
      var easy = pool.filter(function (a) { return a.level <= level + 1; });
      var acc = pick(easy.length ? easy : pool);
      wishes.push({ kind: 'accessory', value: acc.emoji, label: acc.word, suffix: '', icon: acc.emoji });
    }
    if (rnd() < 0.3) {
      wishes.push({ kind: 'sparkle', value: 8, label: 'sparkly', suffix: '', icon: '✨' });
    }
    if (rnd() < 0.25) {
      wishes.push({ kind: 'short', value: 0.6, label: 'a trim', suffix: '', icon: '✂️' });
    }
    // Always at least two wishes, so five stars always means "I read the
    // request and granted all of it", never a freebie.
    if (wishes.length < 2) {
      wishes.push({ kind: 'curl', value: 0.6, label: 'curly', suffix: '', icon: '🌀' });
    }
    return wishes.slice(0, 3);
  }

  /* ONE predicate decides whether a wish is granted, used by both the live
     chips and the final score, so they can never disagree. Colour goes by
     coverage, not plurality, with hysteresis so a chip near the line does
     not flicker: it lights at 35% of the hair and only goes back out under
     30%. */
  function wishDone(w, m, accessories, sparkles, wasDone) {
    switch (w.kind) {
      case 'color': {
        var cov = (m.coverage && m.coverage[w.value]) || 0;
        return cov >= (wasDone ? 0.30 : 0.35);
      }
      case 'curl': return m.curl >= 0.35;
      case 'straight': return m.curl <= 0.25;
      case 'style': return m.style === w.value;
      case 'short': return m.length <= 0.8;
      case 'sparkle': return (sparkles ? sparkles.length : 0) >= w.value;
      case 'accessory':
        return (accessories || []).some(function (a) { return a.emoji === w.value; });
      default: return false;
    }
  }

  /* Scoring is kind on purpose: three stars is the floor, five is very reachable. */
  function score(wishes, m, accessories, sparkles) {
    var got = 0;
    for (var i = 0; i < wishes.length; i++) {
      // The chip state is the truth the child has been watching; honour it.
      if (wishDone(wishes[i], m, accessories, sparkles, wishes[i].done)) { got++; }
    }
    // A rule she can say out loud: 3 for finishing, 4 for granting a wish,
    // 5 for granting them all.
    var stars = got === wishes.length ? 5 : got > 0 ? 4 : 3;
    return { stars: stars, got: got, total: wishes.length };
  }

  global.Salon = {
    COLORS: COLORS, ACCESSORIES: ACCESSORIES, STYLES: STYLES, CLIENTS: CLIENTS,
    PACKS: PACKS, unlockedPacks: unlockedPacks, unlockedAccessories: unlockedAccessories,
    makeRequest: makeRequest, score: score, wishDone: wishDone
  };
})(window);
