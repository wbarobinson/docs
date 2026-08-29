/*
 * badges.js — the trophy shelf, ported pattern from Ara's Number Jungle.
 *
 * Each badge is a pure test against the profile, so awarding is just "run all
 * the tests and see which ones newly pass". A badge can never be missed by a
 * bug in the place it was supposed to be handed out.
 */
;(function (root) {
  var B = (root.SalonBadges = {})
  var queue = []
  var showing = false

  // Filled in from SalonWords.badges at boot: [{id, emoji, name, blurb, test(p)}]
  B.list = []

  B.checkAll = function (p) {
    var Store = root.SalonStore.store
    B.list.forEach(function (badge) {
      if (p.badges[badge.id]) return
      var passed = false
      try { passed = !!badge.test(p) } catch (e) {}
      if (passed && Store.earnBadge(badge.id)) queue.push(badge)
    })
    drain()
  }

  function drain() {
    if (showing || !queue.length) return
    showing = true
    var badge = queue.shift()
    var host = document.getElementById('badge-pop')
    host.innerHTML =
      '<div class="badge-card"><div class="badge-emoji">' + badge.emoji + '</div>' +
      '<div class="badge-name">' + badge.name + '</div>' +
      '<div class="badge-blurb">' + badge.blurb + '</div></div>'
    host.classList.add('show')
    if (root.Sound) root.Sound.play('cheer')
    setTimeout(function () {
      host.classList.remove('show')
      setTimeout(function () { showing = false; drain() }, 350)
    }, 2300)
  }
})(window);
