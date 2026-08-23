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

// --- 3a. repeat sets must not feel like a fixed list -------------------
// Most branches have a small finite pool (45 problems for "sums up to 24",
// nine for "add 1"), so picking at random meant the same dozen kept coming up.
{
  const p = KM.store.addProfile('Variety', '🦜')
  const play = (stageId) => {
    const set = KM.engine.buildSet(p, stageId, 10)
    const keys = set.problems.map((x) => KM.factKey(x))
    set.problems.forEach((prob) => KM.store.recordProblem(p, prob, 2000, true))
    return keys
  }

  // A branch with room should never repeat inside one set.
  const wide = ['A-5', 'A-7', 'B-4', 'C-6']
  wide.forEach((id) => {
    const keys = play(id)
    eq(new Set(keys).size, 10, id + ' never repeats a problem inside one set')
  })

  // Five sets should walk most of the pool rather than circling a favourite few.
  const union = new Set()
  const runs = []
  for (let i = 0; i < 5; i++) {
    const keys = play('A-5')
    runs.push(keys)
    keys.forEach((k) => union.add(k))
  }
  // Compare against what plain random picking would have managed over the same
  // number of draws — a fixed threshold here is just a flaky test.
  const control = new Set()
  for (let i = 0; i < 50; i++) control.add(KM.factKey(KM.stage('A-5').gen()))
  ok(
    union.size >= control.size + 4,
    'least-recently-practised beats plain random for coverage (' +
      union.size +
      ' vs ' +
      control.size +
      ' of 45)',
  )
  ok(union.size >= 35, 'and covers most of the 45-problem pool (got ' + union.size + ')')
  const overlap = runs[0].filter((k) => runs[1].includes(k)).length
  ok(overlap <= 2, 'two sets in a row barely overlap (shared ' + overlap + ')')

  // A pool smaller than the set has to repeat, but evenly and in a new order.
  const small = play('3A-1')
  eq(new Set(small).size, 9, '"Add 1" uses all nine of its facts in one set')
  const counts = {}
  small.forEach((k) => (counts[k] = (counts[k] || 0) + 1))
  eq(Math.max.apply(null, Object.values(counts)), 2, 'and repeats just one of them, only once')
  const smallAgain = play('3A-1')
  ok(small.join() !== smallAgain.join(), 'the next set of nine comes in a different order')

  // The tiniest pool of all still behaves.
  const doubles = play('2A-5')
  eq(doubles.length, 10, 'a five-problem pool still fills a ten-problem set')
  eq(new Set(doubles).size, 5, 'using each of its five facts')
  const dcounts = {}
  doubles.forEach((k) => (dcounts[k] = (dcounts[k] || 0) + 1))
  eq(Math.max.apply(null, Object.values(dcounts)), 2, 'exactly twice each, not four times one')
  KM.store.removeProfile(KM.store.profile().id)
}

// --- 3b. revision never gets harder than the branch she picked ---------
// She went to "Add 1" for an easy win and the first few problems were Level A
// leftovers. Revision has to respect the branch.
{
  const p = KM.store.addProfile('Revision', '🦜')
  ;['18+6', '63+11', '27-8', '89+11', '12*11', '24+4'].forEach((k) => {
    p.facts[k] = { n: 8, wrong: 6, ms: 9500, lastMs: 9500, lastAt: Date.now() }
  })

  let worstBranch = null
  for (const stage of KM.STAGES) {
    for (let round = 0; round < 12 && !worstBranch; round++) {
      for (const prob of KM.engine.buildSet(p, stage.id, 10).problems) {
        // Only revision is under test here; a branch's own generator defines
        // what that branch is allowed to be.
        if (prob.revision && !KM.engine.fitsStage(prob, stage)) {
          worstBranch = stage.id + ' served ' + prob.a + prob.op + prob.b
        }
      }
    }
  }
  ok(!worstBranch, 'no branch ever revises something harder than itself (' + worstBranch + ')')

  const easy = KM.engine.buildSet(p, '3A-1', 10).problems
  ok(
    easy.every((x) => x.op === '+' && x.b === 1 && x.a <= 9),
    '"Add 1" is still nothing but adding 1, however much revision is waiting',
  )
  ok(
    KM.engine.fitsStage({ a: 7, b: 1, op: '+', answer: 8 }, KM.stage('3A-1')),
    'an easy fact is allowed back into an easy branch',
  )
  ok(
    !KM.engine.fitsStage({ a: 18, b: 6, op: '+', answer: 24 }, KM.stage('3A-1')),
    'a hard fact is not',
  )
  ok(
    KM.engine.fitsStage({ a: 18, b: 6, op: '+', answer: 24 }, KM.stage('A-5')),
    'but it is welcome back on the branch it came from',
  )
  KM.store.removeProfile(KM.store.profile().id)
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

// --- 5. stars: finished, accurate, quick ------------------------------
{
  eq(KM.engine.stars(1, 3.0, 3.6), 3, 'quick and perfect is three stars')
  eq(KM.engine.stars(1, 9.2, 4.0), 2, 'all correct but slow still earns the accuracy star')
  eq(KM.engine.stars(0.9, 3.0, 3.6), 3, '9 out of 10 counts as accurate')
  eq(KM.engine.stars(0.8, 3.0, 3.6), 2, 'quick with two wrong is two stars')
  eq(KM.engine.stars(0.5, 9.0, 3.6), 1, 'finishing at all is always worth one star')
  ok(KM.engine.stars(0, 99, 3.6) >= 1, 'a rough set is never zero stars')
  // Beating her own best earns the speed star even when the target is far off.
  eq(KM.engine.stars(1, 8.0, 4.0, 9.2), 3, 'beating her own best counts as quick')
  eq(KM.engine.stars(1, 9.5, 4.0, 9.2), 2, 'a slower set than her best does not')
  eq(KM.engine.stars(1, 8.0, 4.0, 0), 2, 'with no previous best, only the target counts')
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

  // A slow set should not build a run, but perfect accuracy still shows up.
  const slow = playSet(p, 'A-6', { msEach: 12000 })
  eq(slow.quick, false, 'a slow set is not quick')
  eq(slow.run, 0, 'a slow set does not start the run')
  eq(slow.stars, 2, 'a slow but perfect set is two stars, not one')
  const slower = playSet(p, 'A-6', { msEach: 14000, rightFirstTry: 3 })
  eq(slower.stars, 1, 'slow and scrappy is one star')
  const improved = playSet(p, 'A-6', { msEach: 11000 })
  eq(improved.beatOwnBest, true, 'a personal best is recognised')
  eq(improved.stars, 3, 'beating her own best earns the third star')
  eq(improved.run, 0, 'but mastery still needs the real target')

  // A scrappy set breaks a run that was already going.
  playSet(p, 'A-6', { msEach: 1500 })
  const scrappy = playSet(p, 'A-6', { msEach: 1500, rightFirstTry: 5 })
  eq(scrappy.accuracy, 0.5, 'half right first try is 50%')
  eq(scrappy.run, 0, 'a scrappy set resets the run')
}

// --- 5b. she can see herself getting quicker --------------------------
{
  const p = KM.store.addProfile('Trend', '🦜')
  const slow = playSet(p, 'A-5', { msEach: 9200 })
  eq(slow.improvedBy, 0, 'the first set on a branch has nothing to compare to')
  eq(slow.previousTime, 0, 'and no previous time')
  eq(slow.quickAnswers, 0, 'none of them were inside the target')

  const quicker = playSet(KM.store.profile(), 'A-5', { msEach: 8500 })
  ok(Math.abs(quicker.previousTime - 9.2) < 0.2, 'it remembers what she did last time')
  ok(Math.abs(quicker.improvedBy - 0.7) < 0.2, 'and works out that she shaved 0.7s off')
  eq(quicker.beatOwnBest, true, 'a quicker set is a new record')
  eq(quicker.history.length, 2, 'the branch keeps a history to draw')

  const slipped = playSet(KM.store.profile(), 'A-5', { msEach: 9000 })
  ok(slipped.improvedBy < 0, 'a slower set reports a negative improvement')
  eq(slipped.beatOwnBest, false, 'and is not a record')

  const fast = playSet(KM.store.profile(), 'A-5', { msEach: 2000 })
  eq(fast.quickAnswers, 10, 'every answer inside the target is counted')
  eq(fast.stars, 3, 'quick and accurate is three stars')
  eq(KM.store.stageRecord(KM.store.profile(), 'A-5').history.length, 4, 'history keeps growing')
  KM.store.removeProfile(KM.store.profile().id)
}

// --- 6a. progress survives being interrupted --------------------------
{
  const p = KM.store.profile()
  const s = KM.engine.start(p, 'A-5', 10)
  const answeredKeys = []
  for (let i = 0; i < 4; i++) {
    const prob = KM.engine.current(s)
    answeredKeys.push(KM.factKey(prob))
    s.shownAt = Date.now() - 2000
    KM.engine.submit(s, prob.answer)
  }
  const stored = JSON.parse(memory.get(KM.store.KEY))
  const savedMe = stored.profiles.find((x) => x.id === stored.activeId)
  ok(
    answeredKeys.every((k) => savedMe.facts[k] && savedMe.facts[k].n === p.facts[k].n),
    'every answer is in storage during the set, not only at the end',
  )

  const snap = KM.engine.snapshot(s)
  eq(snap.i, 4, 'the snapshot knows how far she got')
  const resumed = KM.engine.resume(snap)
  eq(resumed.i, 4, 'resuming picks up at the same problem')
  eq(resumed.firstTry, 4, 'and keeps what she had already got right')
  eq(resumed.problems.length, 10, 'with the same problems still to come')

  // Finish the resumed set: it should score as a whole set of ten.
  for (let i = 4; i < 10; i++) {
    const prob = KM.engine.current(resumed)
    resumed.shownAt = Date.now() - 2000
    KM.engine.submit(resumed, prob.answer)
  }
  const res = KM.engine.finish(resumed)
  eq(res.count, 10, 'a resumed set still counts as ten problems')
  eq(res.accuracy, 1, 'and the answers from before the interruption still count')
}

// --- 6b. backup and restore -------------------------------------------
{
  const before = KM.store.profile().totals.problems
  const backup = KM.store.exportText()
  KM.store.reset()
  eq(KM.store.profile().totals.problems, 0, 'a reset really does clear everything')
  const res = KM.store.importText(backup)
  eq(res.ok, true, 'a backup restores')
  eq(KM.store.profile().totals.problems, before, 'with every problem intact')
  eq(KM.store.importText('rubbish').ok, false, 'junk is refused')
  eq(KM.store.importText('{"nope":1}').ok, false, 'valid JSON that is not a backup is refused')
  eq(KM.store.profile().totals.problems, before, 'and a refused restore leaves her history alone')
}

// --- 6c. the answer is submitted deliberately by default ---------------
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
  const countBefore = KM.store.profiles().length
  KM.store.removeProfile(b.id)
  eq(KM.store.profiles().length, countBefore - 1, 'removing a child removes them')
}

// --- 9b. two children, two worlds --------------------------------------
{
  // A brand new install should already have both of them.
  const before = memory.get(KM.store.KEY)
  memory.clear()
  KM.store.reset()
  const names = KM.store.profiles().map((x) => x.name + ':' + x.theme)
  eq(names.join(' '), 'Ara:jungle Jon:dino', 'a fresh install has Ara in the jungle and Jon in the valley')
  eq(KM.store.profile().name, 'Ara', 'Ara is the one playing to start with')
  eq(KM.store.theme().mascot, '🦜', 'her world has the macaw')

  const jon = KM.store.profiles()[1]
  KM.store.setActive(jon.id)
  eq(KM.store.theme().id, 'dino', 'swapping to Jon swaps the world')
  eq(KM.store.theme().mascot, '🦖', 'his world has the dinosaur')
  eq(KM.store.theme().cheer, 'roar', 'and roars instead of squawking')
  eq(KM.place('B', 'dino').place, 'Volcano Slopes', 'the levels are renamed for his world')
  eq(KM.place('B', 'jungle').place, 'Treetops', 'and keep their own names in hers')
  eq(KM.place('B', 'dino').hue !== KM.place('B', 'jungle').hue, true, 'the two worlds are coloured differently')

  // Same ladder underneath — the maths must not vary by theme.
  eq(KM.stage(jon.stageId).id, KM.DEFAULT_STAGE, 'both children start on the same branch')
  ok(
    Object.keys(KM.THEMES).every((t) =>
      KM.LEVELS.every((lv) => {
        const place = KM.place(lv.id, t)
        return place.place && place.icon && place.hue >= 0
      }),
    ),
    'every world names and colours every level',
  )

  // Their progress must stay apart.
  const playSetFor = (p, id) => {
    const s = KM.engine.start(p, id, 10)
    for (let i = 0; i < 10; i++) {
      const prob = KM.engine.current(s)
      s.shownAt = Date.now() - 2000
      KM.engine.submit(s, prob.answer)
    }
    return KM.engine.finish(s)
  }
  playSetFor(KM.store.profile(), 'A-5')
  eq(KM.store.profile().totals.sets, 1, "Jon's set counts for Jon")
  KM.store.setActive(KM.store.profiles()[0].id)
  eq(KM.store.profile().totals.sets, 0, 'and not for Ara')
  eq(KM.store.theme().id, 'jungle', 'swapping back brings her world with her')

  // Seeding Jon must be a one-off, not something that piles up every load.
  // importText re-enters load() from raw text, which is what a reload does.
  const snapshot = KM.store.exportText()
  eq(KM.store.importText(snapshot).ok, true, 'the saved state reloads')
  eq(KM.store.profiles().length, 2, 'reloading does not add another Jon')
  eq(KM.store.importText(KM.store.exportText()).ok, true, 'and again')
  eq(KM.store.profiles().length, 2, 'still two children, not three')
  memory.clear()
  if (before) memory.set(KM.store.KEY, before)
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
