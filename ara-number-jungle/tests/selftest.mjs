/*
 * Self-test for the pure logic: every stage's generator, set building, star and
 * mastery rules, badges, and the fact tracker. No browser needed.
 *
 *   node tests/selftest.mjs
 */
import { readFileSync } from 'node:fs'
import { createContext, runInContext } from 'node:vm'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')

// --- a browser-shaped sandbox, minus the browser ------------------------
const memory = new Map()
const sandbox = {
  localStorage: {
    getItem: (k) => (memory.has(k) ? memory.get(k) : null),
    setItem: (k, v) => memory.set(k, String(v)),
    removeItem: (k) => memory.delete(k),
  },
  console,
  Date,
  Math,
  JSON,
}
sandbox.globalThis = sandbox
const ctx = createContext(sandbox)
for (const f of ['curriculum', 'store', 'badges', 'engine']) {
  runInContext(readFileSync(join(root, 'js', `${f}.js`), 'utf8'), ctx, { filename: `${f}.js` })
}
const KM = sandbox.KM

// Deterministic rng so a failure is always reproducible.
let seed = 0xc0ffee
KM.rng = () => {
  seed = (seed + 0x6d2b79f5) | 0
  let t = seed
  t = Math.imul(t ^ (t >>> 15), t | 1)
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}

let pass = 0
const fails = []
function ok(cond, what) {
  if (cond) pass++
  else fails.push(what)
}
function eq(a, b, what) {
  ok(a === b, `${what} (got ${JSON.stringify(a)}, want ${JSON.stringify(b)})`)
}

// --- 1. the ladder itself ---------------------------------------------
{
  const ids = new Set()
  KM.STAGES.forEach((s) => ids.add(s.id))
  eq(ids.size, KM.STAGES.length, 'stage ids are unique')
  ok(
    KM.STAGES.every((s) => KM.level(s.level)),
    'every stage belongs to a real level',
  )
  ok(
    KM.STAGES.every((s) => typeof s.gen === 'function' && s.target > 0 && s.name && s.detail),
    'every stage has a generator, a target and labels',
  )
  ok(!!KM.stage(KM.DEFAULT_STAGE), 'the default starting stage exists')
  eq(KM.stage(KM.DEFAULT_STAGE).name, 'Sums up to 24', 'the default branch is the "sums up to 24" section')
  eq(KM.nextStage(KM.STAGES[KM.STAGES.length - 1].id), null, 'the last stage has no next')
}

// --- 2. every generator, a few hundred times each ----------------------
const INVARIANTS = {
  '3A-1': (p) => p.b === 1 && p.a <= 9,
  '3A-4': (p) => p.b <= 3 && p.answer <= 10,
  '3A-5': (p) => p.a >= 10 && p.a <= 18 && p.b <= 3,
  '2A-1': (p) => (p.b === 4 || p.b === 5) && p.answer <= 10,
  '2A-2': (p) => p.answer === 10,
  '2A-5': (p) => p.a === p.b && p.answer <= 10,
  '2A-6': (p) => p.answer <= 10,
  // The sum ceilings are the whole point of Level A — check every one.
  'A-1': (p) => p.answer <= 12 && p.answer >= 8,
  'A-2': (p) => p.answer <= 15 && p.answer >= 11,
  'A-3': (p) => p.answer <= 18 && p.answer >= 14,
  'A-4': (p) => p.answer <= 20 && p.answer >= 17,
  'A-5': (p) => p.answer <= 24 && p.answer >= 20 && p.b <= 9 && p.a >= 11,
  'A-6': (p) => p.answer <= 28 && p.answer >= 24 && p.b <= 9,
  'A-7': (p) => p.answer <= 28,
  'A-8': (p) => p.b === 10 && p.a > 24,
  'A-9': (p) => p.b === 11 && p.a > 24,
  'A-12': (p) => p.op === '-' && p.b >= 7 && p.b <= 9 && p.answer >= 0,
  'B-1': (p) => Math.floor(p.answer / 10) === Math.floor(p.a / 10),
  'B-2': (p) => Math.floor(p.answer / 10) > Math.floor(p.a / 10),
  'B-6': (p) => p.a % 10 >= p.b % 10,
  'B-7': (p) => p.a % 10 < p.b % 10,
  'C-1': (p) => p.b === 2,
  'C-8': (p) => p.op === '/' && [2, 5, 10].includes(p.b),
}

for (const stage of KM.STAGES) {
  let bad = null
  let brokenInvariant = null
  let biggest = 0
  for (let i = 0; i < 300; i++) {
    const p = stage.gen()
    const expect =
      p.op === '+' ? p.a + p.b : p.op === '-' ? p.a - p.b : p.op === '*' ? p.a * p.b : p.a / p.b
    if (
      !p ||
      p.answer !== expect ||
      p.answer < 0 ||
      p.answer % 1 !== 0 ||
      p.a < 0 ||
      p.b < 0 ||
      (p.op === '/' && p.b === 0)
    ) {
      bad = p
      break
    }
    biggest = Math.max(biggest, p.answer)
    const inv = INVARIANTS[stage.id]
    if (inv && !inv(p)) {
      brokenInvariant = p
      break
    }
  }
  ok(!bad, `${stage.id} only produces sound arithmetic (${JSON.stringify(bad)})`)
  ok(!brokenInvariant, `${stage.id} respects its own description (${JSON.stringify(brokenInvariant)})`)
  ok(biggest < 10000, `${stage.id} answers stay typeable on a numpad (max ${biggest})`)
}

// --- 3. set building --------------------------------------------------
{
  const p = KM.store.profile()
  const set = KM.engine.buildSet(p, 'A-5', 10)
  eq(set.problems.length, 10, 'a set is the size you asked for')
  eq(set.stageId, 'A-5', 'a set knows its stage')
  ok(
    set.problems.every((x) => x && x.answer >= 20 && x.answer <= 24),
    'a fresh set is all current-branch work when there is no revision yet',
  )
  eq(KM.engine.buildSet(p, 'A-5', 5).problems.length, 5, 'short sets work')
  eq(KM.engine.buildSet(p, 'A-5', 20).problems.length, 20, 'long sets work')

  // Plant some sore facts and check they get pulled back in, but never first
  // or last.
  p.facts['18+6'] = { n: 6, wrong: 4, ms: 9000, lastMs: 9000, lastAt: Date.now() }
  p.facts['17+7'] = { n: 5, wrong: 3, ms: 8000, lastMs: 8000, lastAt: Date.now() }
  p.facts['15+9'] = { n: 4, wrong: 2, ms: 7000, lastMs: 7000, lastAt: Date.now() }
  let sawRevision = 0
  for (let i = 0; i < 40; i++) {
    const s2 = KM.engine.buildSet(p, 'A-5', 10)
    const idx = s2.problems.map((x, n) => (x.revision ? n : -1)).filter((n) => n >= 0)
    sawRevision += idx.length
    ok(idx.length <= 3, 'revision never takes over more than a third of a set')
    ok(!idx.includes(0) && !idx.includes(9), 'revision is never the first or last problem')
  }
  ok(sawRevision > 0, 'sore facts actually come back round')
  delete p.facts['18+6']
  delete p.facts['17+7']
  delete p.facts['15+9']
}

// --- 4. parsing facts -------------------------------------------------
{
  eq(KM.engine.parseFact('27+11').answer, 38, 'parses an addition fact')
  eq(KM.engine.parseFact('40-9').answer, 31, 'parses a subtraction fact')
  eq(KM.engine.parseFact('7*8').answer, 56, 'parses a multiplication fact')
  eq(KM.engine.parseFact('12/4').answer, 3, 'parses a division fact')
  eq(KM.engine.parseFact('9-40'), null, 'refuses a fact that would go negative')
  eq(KM.engine.parseFact('5/0'), null, 'refuses division by zero')
  eq(KM.engine.parseFact('7/2'), null, 'refuses a division with a remainder')
  eq(KM.engine.parseFact('nonsense'), null, 'refuses junk')
}

// --- 5. stars ---------------------------------------------------------
{
  eq(KM.engine.stars(1, 3.0, 3.6), 3, 'quick and perfect is three stars')
  eq(KM.engine.stars(1, 4.0, 3.6), 2, 'perfect but slow is two stars')
  eq(KM.engine.stars(0.8, 3.0, 3.6), 2, 'quick with a couple wrong is two stars')
  eq(KM.engine.stars(0.5, 9.0, 3.6), 1, 'finishing at all is one star')
}

// --- 6. playing a set end to end -------------------------------------
// (msEach is faked by winding shownAt back, which is exactly what the real
// clock does when she stares at a problem for that long.)
function playSet(profile, stageId, { rightFirstTry = 10, msEach = 2000, size = 10 } = {}) {
  const s = KM.engine.start(profile, stageId, size)
  for (let i = 0; i < s.problems.length; i++) {
    const prob = KM.engine.current(s)
    if (i >= rightFirstTry) {
      s.shownAt = Date.now() - msEach
      KM.engine.submit(s, prob.answer + 1) // a wrong go first
    }
    s.shownAt = Date.now() - msEach // pretend she took msEach on this one
    KM.engine.submit(s, prob.answer)
  }
  return KM.engine.finish(s)
}

{
  const p = KM.store.profile()
  eq(p.stageId, 'A-5', 'a new profile starts on "sums up to 24"')
  eq(p.name, 'Ara', 'a new profile is Ara by default')

  const r1 = playSet(p, 'A-5', { msEach: 2000 })
  eq(r1.count, 10, 'a set records ten problems')
  eq(r1.accuracy, 1, 'all-first-try is 100%')
  eq(r1.stars, 3, 'a quick perfect set is three stars')
  eq(r1.run, 1, 'one qualifying set starts the run')
  eq(r1.mastered, false, 'one set is not mastery')
  eq(p.totals.problems, 10, 'totals add up')
  eq(p.streak.current, 1, 'practising today starts the streak')
  ok(
    r1.badges.some((b) => b.id === 'first-set'),
    'the first set earns First Steps',
  )
  ok(
    r1.badges.some((b) => b.id === 'perfect'),
    'a clean sheet earns Perfect Set',
  )

  playSet(p, 'A-5', { msEach: 2000 })
  const r3 = playSet(p, 'A-5', { msEach: 2000 })
  eq(r3.mastered, true, 'three quick accurate sets in a row masters the stage')
  eq(r3.nextStageId, 'A-6', 'mastery moves her to the next branch')
  eq(p.stageId, 'A-6', 'the profile follows her up')
  eq(p.unlockedTo, 'A-6', 'the map unlocks the new stage')
  ok(KM.store.stageRecord(p, 'A-5').mastered, 'the mastered stage is marked')
  eq(r3.levelledUp, false, 'A-5 to A-6 is not a new level')

  // A slow set should not build a run.
  const slow = playSet(p, 'A-6', { msEach: 12000 })
  eq(slow.quick, false, 'a slow set is not quick')
  eq(slow.run, 0, 'a slow set does not start the run')
  eq(slow.stars, 1, 'a slow set is one star')

  // A scrappy set breaks a run that was already going.
  playSet(p, 'A-6', { msEach: 1500 })
  const scrappy = playSet(p, 'A-6', { msEach: 1500, rightFirstTry: 5 })
  eq(scrappy.accuracy, 0.5, 'half right first try is 50%')
  eq(scrappy.run, 0, 'a scrappy set resets the run')
}

// --- 6b. the answer is submitted deliberately by default ---------------
{
  const fresh = KM.store.newProfile('Settings', '🦜')
  eq(fresh.settings.autoCheck, false, 'auto-check is off by default, so a typo can be backspaced')
  eq(fresh.settings.autoNext, true, 'moving to the next problem is automatic')
  eq(fresh.settings.setSize, 10, 'a set is ten problems by default')
}

// --- 7. the fact tracker ---------------------------------------------
{
  const p = KM.store.profile()
  const before = KM.store.trickyFacts(p, 20).length
  const prob = { a: 27, b: 8, op: '-', answer: 19 }
  for (let i = 0; i < 4; i++) KM.store.recordProblem(p, prob, 9000, false)
  const tricky = KM.store.trickyFacts(p, 20)
  ok(tricky.length >= before, 'a repeatedly-wrong fact shows up as tricky')
  ok(tricky[0].key === '27-8', 'the worst fact sorts to the top')
  eq(p.facts['27-8'].n, 4, 'attempts are counted')
  eq(p.facts['27-8'].wrong, 4, 'wrong answers are counted')

  // Getting it right and quick a few times should pull it back down.
  for (let i = 0; i < 6; i++) KM.store.recordProblem(p, prob, 1200, true)
  ok(p.facts['27-8'].ms < 4000, 'the rolling time comes down as she gets quicker')
}

// --- 8. badges --------------------------------------------------------
{
  const fresh = KM.store.newProfile('Test', '🦜')
  eq(KM.awardBadges(fresh, null).length, 0, 'a brand new profile has earned nothing')
  fresh.totals.sets = 10
  fresh.totals.problems = 100
  fresh.streak.best = 7
  const won = KM.awardBadges(fresh, { stars: 3, perProblem: 1.8, accuracy: 1 }).map((b) => b.id)
  ok(won.includes('sets-10'), 'ten sets earns Ten Sets')
  ok(won.includes('problems-100'), 'a hundred problems earns 100 Problems')
  ok(won.includes('streak-7'), 'a week in a row earns Whole Week')
  ok(won.includes('lightning'), 'under two seconds a problem earns Lightning')
  eq(KM.awardBadges(fresh, null).length, 0, 'badges are never handed out twice')
  ok(
    KM.BADGES.every((b) => b.icon && b.name && b.hint && typeof b.test === 'function'),
    'every badge has an icon, a name, a hint and a test',
  )
  eq(new Set(KM.BADGES.map((b) => b.id)).size, KM.BADGES.length, 'badge ids are unique')
}

// --- 9. profiles are properly separate --------------------------------
{
  const a = KM.store.profile()
  const b = KM.store.addProfile('Second', '🐢')
  eq(KM.store.profile().id, b.id, 'adding a child switches to them')
  eq(KM.store.profile().totals.problems, 0, 'the new child starts from zero')
  playSet(KM.store.profile(), 'A-1', { msEach: 2000 })
  eq(KM.store.profile().totals.sets, 1, 'their sets are their own')
  KM.store.setActive(a.id)
  ok(KM.store.profile().totals.sets > 1, 'the first child keeps their history')
  KM.store.removeProfile(b.id)
  eq(KM.store.profiles().length, 1, 'removing a child removes them')
}

// --- 10. it survives a reload ----------------------------------------
{
  const before = KM.store.profile().totals.problems
  KM.store.save()
  const raw = JSON.parse(memory.get(KM.store.KEY))
  const me = raw.profiles.find((x) => x.id === raw.activeId)
  eq(me.totals.problems, before, 'progress is written to storage as-is')
  ok(raw.version === 1, 'storage is versioned')
}

console.log(`\n${pass} checks passed`)
if (fails.length) {
  console.error(`\n${fails.length} FAILED:`)
  fails.forEach((f) => console.error('  ✗ ' + f))
  process.exit(1)
}
console.log('all good ✅\n')
