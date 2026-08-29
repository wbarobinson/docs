/* Unit tests for the persistence layer. Run: node test/store.test.js */
'use strict'
const assert = require('assert')

function freshWorld() {
  const mem = {}
  const root = {
    localStorage: {
      getItem: k => (k in mem ? mem[k] : null),
      setItem: (k, v) => { mem[k] = String(v) },
      removeItem: k => { delete mem[k] },
    },
    setTimeout, clearTimeout,
  }
  const load = f => new Function('root', require('fs').readFileSync(__dirname + '/../js/' + f, 'utf8')
    .replace(/\(typeof globalThis[^)]*\)$/m, '(root)'))(root)
  load('store.js'); load('merge.js')
  return root
}

// 1. fresh state has Ara and Jon with fixed ids
let w = freshWorld()
let s = w.SalonStore.store.load()
assert.strictEqual(s.profiles[0].id, 'ara')
assert.strictEqual(s.profiles[1].id, 'jon')

// 2. recording a client updates totals via the log
w.SalonStore.store.recordClient({ stars: 5, got: 3, total: 3, style: 'braid', accs: ['🦋'], colors: ['#ff7ab8'], client: 'Poppy' })
w.SalonStore.store.recordClient({ stars: 4, got: 2, total: 3, style: 'braid', accs: [], colors: [], client: 'Nia' })
let p = w.SalonStore.store.profile()
assert.strictEqual(p.totals.clients, 2)
assert.strictEqual(p.totals.stars, 9)
assert.strictEqual(p.totals.fiveStar, 1)
assert.strictEqual(p.styleCounts.braid, 2)
assert.strictEqual(p.accCounts['🦋'], 1)
assert.strictEqual(p.streak.current, 1)

// 3. word records
w.SalonStore.store.recordWord('cat', true, 1)
w.SalonStore.store.recordWord('cat', false, 1)
p = w.SalonStore.store.profile()
assert.strictEqual(p.words.cat.n, 1)
assert.strictEqual(p.words.cat.wrong, 1)
assert.strictEqual(p.totals.words, 1)
assert.strictEqual(p.totals.stars, 10)

// 4. save survives reload through main key; corrupt main falls back to backup
assert.ok(w.SalonStore.store.save())
const exported = w.SalonStore.store.exportText()

// 5. merge: union of logs, commutative, progress only up
let w2 = freshWorld()
w2.SalonStore.store.load()
w2.SalonStore.store.recordClient({ stars: 3, got: 1, total: 2, style: 'bun', accs: ['🌸'], colors: [], client: 'Mei' })
w2.SalonStore.store.recordWord('dog', true, 1)
const A = JSON.parse(exported)
const B = JSON.parse(w2.SalonStore.store.exportText())
const AB = w2.SalonMerge(JSON.parse(JSON.stringify(A)), JSON.parse(JSON.stringify(B)))
const BA = w2.SalonMerge(JSON.parse(JSON.stringify(B)), JSON.parse(JSON.stringify(A)))
const araAB = AB.profiles.find(x => x.id === 'ara')
const araBA = BA.profiles.find(x => x.id === 'ara')
assert.strictEqual(araAB.totals.clients, 3)          // 2 + 1, unioned not maxed
assert.strictEqual(araAB.totals.stars, 14)           // 9 + 1 word + 3 + 1 word
assert.strictEqual(araAB.totals.words, 2)
assert.strictEqual(araAB.styleCounts.braid, 2)
assert.strictEqual(araAB.styleCounts.bun, 1)
assert.deepStrictEqual(
  { c: araAB.totals, w: Object.keys(araAB.words).sort() },
  { c: araBA.totals, w: Object.keys(araBA.words).sort() },
  'merge must be commutative')

// 6. merging the same copy twice changes nothing (idempotent union)
const ABA = w2.SalonMerge(JSON.parse(JSON.stringify(AB)), JSON.parse(JSON.stringify(A)))
assert.strictEqual(ABA.profiles.find(x => x.id === 'ara').totals.clients, 3)

// 7. corrupt main copy falls back to the backup
let w3 = freshWorld()
w3.SalonStore.store.load()
w3.SalonStore.store.recordClient({ stars: 5, got: 1, total: 1, style: 'down', accs: [], colors: [], client: 'Isla' })
w3.SalonStore.store.save() // rolls good copy into .bak on next save
w3.SalonStore.store.recordClient({ stars: 3, got: 1, total: 1, style: 'down', accs: [], colors: [], client: 'Ava' })
w3.localStorage.setItem('arahairsalon.v1', '{corrupt json!!')
// a fresh module world reading the same storage must recover from .bak
const mem3 = w3.localStorage
let w4 = freshWorld()
;['arahairsalon.v1', 'arahairsalon.v1.bak'].forEach(k => {
  const v = mem3.getItem(k)
  if (v !== null) w4.localStorage.setItem(k, v)
})
const s4 = w4.SalonStore.store.load()
assert.ok(s4.restoredFromBackup, 'should recover from backup')
assert.ok(s4.profiles.find(x => x.id === 'ara').totals.clients >= 1)

// 8. import merges rather than overwrites
let w5 = freshWorld()
w5.SalonStore.store.load()
w5.SalonStore.store.recordWord('sun', true, 1)
const res = w5.SalonStore.store.importText(exported)
assert.ok(res.ok)
const ara5 = w5.SalonStore.store.load().profiles.find(x => x.id === 'ara')
assert.ok(ara5.words.sun, 'local word kept after import')
assert.ok(ara5.words.cat, 'imported word arrived')

// 9. session snapshot round-trips and expires with the wrong profile
let w6 = freshWorld()
w6.SalonStore.store.load()
w6.SalonStore.store.saveSession({ strands: [{ n: 5 }], client: 'Poppy' })
assert.ok(w6.SalonStore.store.loadSession())
w6.SalonStore.store.setActive('jon')
assert.strictEqual(w6.SalonStore.store.loadSession(), null, 'session is per-child')

// 10. a re-shoot pays its star delta but is not a second visit
let w7 = freshWorld()
w7.SalonStore.store.load()
w7.SalonStore.store.recordClient({ stars: 4, got: 2, total: 3, style: 'braid', accs: [], colors: [], client: 'Poppy', reshoot: false, finalStars: 4 })
w7.SalonStore.store.recordClient({ stars: 1, got: 3, total: 3, style: 'braid', accs: [], colors: [], client: 'Poppy', reshoot: true, finalStars: 5 })
const p7 = w7.SalonStore.store.profile()
assert.strictEqual(p7.totals.clients, 1, 'reshoot is not a second client')
assert.strictEqual(p7.totals.stars, 5, 'stars are first shot plus delta')
assert.strictEqual(p7.totals.fiveStar, 1, 'reaching 5 incrementally still counts')
assert.strictEqual(p7.clientCounts.Poppy, 1)
assert.strictEqual(p7.styleCounts.braid, 1)

// 11. a "say it" hint is never a wrong answer
w7.SalonStore.store.recordWord('bee', false, 1, true)   // hint tap
w7.SalonStore.store.recordWord('bee', true, 1)
const bee = w7.SalonStore.store.profile().words.bee
assert.strictEqual(bee.wrong, 0, 'hints are not failures')
assert.strictEqual(bee.hints, 1)
assert.strictEqual(bee.n, 1)

console.log('store/merge: all tests passed')
