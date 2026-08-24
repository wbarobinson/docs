/*
 * Family-account tests: two devices, one code, the real endpoint.
 *
 * The server here IS netlify/functions/progress.mjs — imported and handed real
 * Request objects — so the compare-and-set logic under test is the code that
 * ships. Only Netlify Blobs itself is substituted (its absence makes
 * store.mjs fall back to an in-process Map, which is what we want in a test).
 *
 *   node tests/sync.mjs
 */
import { readFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { createContext, runInContext } from 'node:vm'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import handler from '../netlify/functions/progress.mjs'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

let pass = 0
const fails = []
const ok = (c, what) => (c ? pass++ : fails.push(what))
const eq = (a, b, what) => ok(a === b, `${what} (got ${JSON.stringify(a)}, want ${JSON.stringify(b)})`)

// --- the real function, behind a real socket ---------------------------
let requestCount = 0
const server = createServer(async (req, res) => {
  requestCount++
  const chunks = []
  for await (const c of req) chunks.push(c)
  const url = `http://localhost${req.url}`
  const request = new Request(url, {
    method: req.method,
    headers: req.headers,
    body: chunks.length ? Buffer.concat(chunks) : undefined,
  })
  const out = await handler(request)
  res.writeHead(out.status, Object.fromEntries(out.headers))
  res.end(Buffer.from(await out.arrayBuffer()))
})
await new Promise((r) => server.listen(0, '127.0.0.1', r))
const base = `http://127.0.0.1:${server.address().port}`

// --- a device: its own localStorage, its own copy of the app ----------
function makeDevice(name) {
  const memory = new Map()
  const sandbox = {
    console,
    Date,
    Math,
    JSON,
    Promise,
    Object,
    Array,
    String,
    Number,
    Boolean,
    encodeURIComponent,
    setTimeout,
    clearTimeout,
    Request,
    Response,
    localStorage: {
      getItem: (k) => (memory.has(k) ? memory.get(k) : null),
      setItem: (k, v) => memory.set(k, String(v)),
      removeItem: (k) => memory.delete(k),
    },
    // Every device talks to the one server, with relative URLs resolved.
    fetch: (url, opts) => fetch(url.startsWith('http') ? url : base + url, opts),
  }
  sandbox.globalThis = sandbox
  sandbox.window = sandbox
  const ctx = createContext(sandbox)
  for (const f of ['curriculum', 'store', 'merge', 'sync', 'badges', 'engine']) {
    runInContext(readFileSync(join(root, 'js', `${f}.js`), 'utf8'), ctx, { filename: `${name}:${f}.js` })
  }
  const KM = sandbox.KM
  KM.sync.ENDPOINT = base + '/api/progress'
  // Deterministic problems per device.
  let seed = name.length * 7919
  KM.rng = () => {
    seed = (seed + 0x6d2b79f5) | 0
    let t = seed
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
  KM.playSet = (stageId, msEach = 2000) => {
    const p = KM.store.profile()
    const s = KM.engine.start(p, stageId || p.stageId, 10)
    for (let i = 0; i < 10; i++) {
      const prob = KM.engine.current(s)
      s.shownAt = Date.now() - msEach
      KM.engine.submit(s, prob.answer)
    }
    return KM.engine.finish(s)
  }
  KM.__sandbox = sandbox
  return KM
}

// --- health ------------------------------------------------------------
{
  const res = await fetch(`${base}/api/progress?health=1`)
  const body = await res.json()
  eq(res.status, 200, 'the endpoint answers a health check')
  eq(body.ok, true, 'and reports itself up')
  ok(
    body.backend === 'memory-only',
    'in tests it correctly reports that storage is NOT durable (' + body.backend + ')',
  )
  ok(body.note.length > 10, 'and explains why in words a human can act on')
}

// --- bad requests are refused, not crashed on -------------------------
{
  eq((await fetch(`${base}/api/progress?code=x`)).status, 400, 'a too-short code is refused')
  eq((await fetch(`${base}/api/progress?code=fern-abcdef`)).status, 404, 'an unknown family is a clean 404')
  const badPost = await fetch(`${base}/api/progress`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: 'not json',
  })
  eq(badPost.status, 400, 'an unreadable body is refused')
  const noProfiles = await fetch(`${base}/api/progress`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ code: 'fern-abcdef', baseVersion: 0, data: { nope: true } }),
  })
  eq(noProfiles.status, 400, 'a body with no progress in it is refused')
  eq((await fetch(`${base}/api/progress`, { method: 'DELETE' })).status, 405, 'other methods are refused')
}

// --- one device creates an account -----------------------------------
const ipad = makeDevice('ipad')
ipad.playSet('A-5')
ipad.playSet('A-5')
const created = await ipad.sync.create()
const code = created.code
ok(created.ok, 'creating a family code pushes what is already on the device')
ok(/^[a-z]+-[a-z0-9]{10}$/.test(code), 'the code is a word and ten random characters (' + code + ')')
eq(ipad.sync.status().version, 1, 'the device knows it holds version 1')

// --- a second device joins ------------------------------------------
const laptop = makeDevice('laptop')
laptop.playSet('A-5') // some local work first, which must not be lost
const localBefore = laptop.store.profile().totals.problems
const joined = await laptop.sync.join(code.toUpperCase() + '  ')
ok(joined.ok, 'a second device joins with the same code, however it is typed')
eq(
  laptop.store.profile().totals.problems,
  localBefore + 20,
  "joining adds the other device's work to this one instead of replacing it",
)
eq(laptop.store.profiles().length, 2, 'both children came across')

// --- both children stay separate ------------------------------------
{
  const jon = laptop.store.profiles()[1]
  laptop.store.setActive(jon.id)
  laptop.playSet('A-1')
  await laptop.sync.flush()
  await ipad.sync.pull()
  const ipadJon = ipad.store.profiles().find((p) => p.id === jon.id)
  const ipadAra = ipad.store.profiles().find((p) => p.id !== jon.id)
  eq(ipadJon.totals.sets, 1, "Jon's set arrives on the other device")
  eq(ipadAra.totals.sets, 3, "and does not get mixed into Ara's numbers")
  laptop.store.setActive(laptop.store.profiles()[0].id)
}

// --- the interesting case: both practise while apart -----------------
{
  const araId = ipad.store.profiles()[0].id
  ipad.store.setActive(araId)
  laptop.store.setActive(araId)
  const before = ipad.store.profile().totals.sets

  ipad.playSet('A-5') // on the sofa
  laptop.playSet('A-5') // on the kitchen table, no network in between

  await ipad.sync.flush()
  const laptopPush = await laptop.sync.flush()
  ok(laptopPush.ok, 'the second writer is not rejected, it merges and retries')

  await ipad.sync.pull()
  const a = ipad.store.profile().totals
  const b = laptop.store.profile().totals
  eq(a.sets, b.sets, 'both devices end up agreeing')
  eq(a.problems, b.problems, 'on every number')
  ok(a.sets >= before + 1, 'and neither evening of practice was thrown away (' + a.sets + ')')
}

// --- merge is order-independent and never loses anything -------------
{
  const KM = ipad
  const A = JSON.parse(JSON.stringify(KM.store.load()))
  const B = JSON.parse(JSON.stringify(KM.store.load()))
  // Pre-log history is a baseline: both sides describe the same past, so the
  // larger is the true one.
  A.profiles[0].baseline.problems = 500
  A.profiles[0].badges['first-set'] = 1000
  A.profiles[0].stages['A-5'] = Object.assign({}, A.profiles[0].stages['A-5'], { mastered: true, bestMs: 9000 })
  B.profiles[0].baseline.problems = 300
  B.profiles[0].badges['perfect'] = 500
  B.profiles[0].stages['A-5'] = Object.assign({}, B.profiles[0].stages['A-5'], { mastered: false, bestMs: 7000 })

  const ab = KM.merge(A, B)
  const ba = KM.merge(B, A)
  eq(JSON.stringify(ab.profiles[0].totals), JSON.stringify(ba.profiles[0].totals), 'merge order does not matter')
  eq(ab.profiles[0].baseline.problems, 500, 'the larger baseline wins')
  const logged = ab.profiles[0].log.reduce((n, e) => n + e.count, 0)
  eq(ab.profiles[0].totals.problems, 500 + logged, 'totals are the baseline plus every logged set, counted once')

  // Merging is idempotent: syncing the same copy again must change nothing.
  const twice = KM.merge(A, ab)
  eq(
    twice.profiles[0].totals.problems,
    ab.profiles[0].totals.problems,
    'merging an already-merged copy does not inflate the totals',
  )
  eq(twice.profiles[0].log.length, ab.profiles[0].log.length, 'nor duplicate any set'
  )
  eq(ab.profiles[0].stages['A-5'].mastered, true, 'a mastered branch is never un-mastered')
  eq(ab.profiles[0].stages['A-5'].bestMs, 7000, 'the better best time wins')
  ok(ab.profiles[0].badges['first-set'] && ab.profiles[0].badges['perfect'], 'badges from both sides survive')
  eq(ab.profiles[0].badges['first-set'], 1000, 'and keep the earliest time they were earned')

  // A brand new child added on one device must survive a merge.
  const withNewKid = JSON.parse(JSON.stringify(A))
  withNewKid.profiles.push(KM.store.newProfile('Tertius', '🐢', 'dino'))
  const merged = KM.merge(withNewKid, B)
  eq(merged.profiles.length, A.profiles.length + 1, 'a child added on one device is kept')
}

// --- a wiped device gets everything back -----------------------------
{
  const wiped = makeDevice('wiped-iphone')
  eq(wiped.store.profile().totals.problems, 0, 'a fresh device starts empty')
  const back = await wiped.sync.join(code)
  ok(back.ok, 'it joins with the family code')
  ok(wiped.store.profile().totals.problems > 0, 'and the history comes back')
  eq(
    wiped.store.profiles().length,
    ipad.store.profiles().length,
    'with every child present',
  )
}

// --- failure never costs anything ------------------------------------
{
  const offline = makeDevice('offline')
  offline.sync.ENDPOINT = 'http://127.0.0.1:1/api/progress' // nothing listening
  // Joined a family, then lost the network: the case that must be harmless.
  offline.__sandbox.localStorage.setItem(
    offline.sync.META,
    JSON.stringify({ code: 'fern-abcdefghij', version: 3 }),
  )
  offline.playSet('A-5')
  const before = offline.store.profile().totals.problems
  const r = await offline.sync.push()
  eq(r.ok, false, 'a push with no server fails')
  eq(offline.store.profile().totals.problems, before, 'and leaves local progress alone')
  ok(offline.sync.status().lastError, 'the failure is recorded for the grown-ups screen')
  const p = await offline.sync.pull()
  eq(p.ok, false, 'a pull with no server fails too')
  eq(offline.store.profile().totals.problems, before, 'and still leaves local progress alone')
}

server.close()
console.log(`\n${pass} checks passed (${requestCount} requests to the real endpoint)`)
if (fails.length) {
  console.error(`\n${fails.length} FAILED:`)
  fails.forEach((f) => console.error('  ✗ ' + f))
  process.exit(1)
}
console.log('all good ✅\n')
