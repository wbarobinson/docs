/* Ara's Hair Salon - the clients who come in, and the looks they ask for. */
(function (global) {
  'use strict';

  var COLORS = [
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

  var ACCESSORIES = [
    '🎀', '🌸', '👑', '⭐', '🦋', '💎', '🌈', '🌼', '🍓', '🐚', '🍀', '❤️'
  ];

  var STYLES = [
    { id: 'down', label: 'Down', icon: '💇' },
    { id: 'ponytail', label: 'Ponytail', icon: '🐴' },
    { id: 'highpony', label: 'High pony', icon: '⬆️' },
    { id: 'pigtails', label: 'Pigtails', icon: '👧' },
    { id: 'bun', label: 'Bun', icon: '🧁' },
    { id: 'braid', label: 'Braid', icon: '🪢' },
    { id: 'halfup', label: 'Half up', icon: '🎗️' }
  ];

  var CLIENTS = [
    { name: 'Poppy', skin: '#f6cfae', skin2: '#e3b191', hair: '#5c3823', eye: '#4a6b3a', shirt: '#ff8fb1', blush: '#ff9aa8' },
    { name: 'Nia', skin: '#8a5a3b', skin2: '#764930', hair: '#2f2b45', eye: '#3b2a1e', shirt: '#7ad3c0', blush: '#c4726a' },
    { name: 'Mei', skin: '#f0d3b4', skin2: '#dcb593', hair: '#2f2b45', eye: '#3a2b22', shirt: '#b98cf5', blush: '#ef9a9a' },
    { name: 'Isla', skin: '#fbe0cd', skin2: '#eec3a8', hair: '#d9a441', eye: '#4d7fa8', shirt: '#ffd23f', blush: '#ffa0a8' },
    { name: 'Zuri', skin: '#6d4429', skin2: '#5a3720', hair: '#3a2418', eye: '#3b2a1e', shirt: '#4bc4e8', blush: '#b8655c' },
    { name: 'Ava', skin: '#e8b78f', skin2: '#d29e76', hair: '#a4692f', eye: '#5c8a5c', shirt: '#5fdcb0', blush: '#e08a86' }
  ];

  /* A request is 1-3 wishes. Every wish is easy to see and easy to grant. */
  function makeRequest(rnd) {
    var pick = function (arr) { return arr[Math.floor(rnd() * arr.length)]; };
    var wishes = [];
    var color = pick(COLORS);
    wishes.push({ kind: 'color', value: color.css, label: color.name + ' hair', icon: '🎨' });

    var roll = rnd();
    if (roll < 0.45) {
      wishes.push({ kind: 'curl', value: 0.6, label: 'curly', icon: '🌀' });
    } else if (roll < 0.7) {
      wishes.push({ kind: 'straight', value: 0.2, label: 'nice and straight', icon: '💧' });
    }

    if (rnd() < 0.6) {
      var st = STYLES[1 + Math.floor(rnd() * (STYLES.length - 1))];
      wishes.push({ kind: 'style', value: st.id, label: 'a ' + st.label.toLowerCase(), icon: st.icon });
    }
    if (rnd() < 0.6) {
      var acc = pick(ACCESSORIES);
      wishes.push({ kind: 'accessory', value: acc, label: 'a ' + acc, icon: acc });
    }
    if (rnd() < 0.3) {
      wishes.push({ kind: 'short', value: 0.6, label: 'a trim', icon: '✂️' });
    }
    return wishes.slice(0, 3);
  }

  /* Scoring is kind on purpose: three stars is the floor, five is very reachable. */
  function score(wishes, m, accessories) {
    var got = 0;
    for (var i = 0; i < wishes.length; i++) {
      var w = wishes[i];
      if (w.kind === 'color' && m.mainColor === w.value) { got++; }
      else if (w.kind === 'curl' && m.curl >= 0.35) { got++; }
      else if (w.kind === 'straight' && m.curl <= 0.25) { got++; }
      else if (w.kind === 'style' && m.style === w.value) { got++; }
      else if (w.kind === 'short' && m.length <= 0.8) { got++; }
      else if (w.kind === 'accessory') {
        for (var a = 0; a < accessories.length; a++) {
          if (accessories[a].emoji === w.value) { got++; break; }
        }
      }
    }
    var ratio = wishes.length ? got / wishes.length : 1;
    return { stars: Math.max(3, Math.round(3 + ratio * 2)), got: got, total: wishes.length };
  }

  global.Salon = {
    COLORS: COLORS, ACCESSORIES: ACCESSORIES, STYLES: STYLES, CLIENTS: CLIENTS,
    makeRequest: makeRequest, score: score
  };
})(window);
