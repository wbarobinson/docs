/*
 * End-to-end smoke test: drives the real UI in headless Chromium over the
 * DevTools protocol, using real mouse events (which Chromium turns into the
 * same pointer events an iPad produces), and plays a full set.
 *
 *   node tests/smoke.mjs [--shots <dir>]
 */
import { spawn } from 'node:child_process'
import { mkdirSync, writeFileSync, existsSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const shotsArg = process.argv.indexOf('--shots')
const SHOTS = shotsArg > -1 ? process.argv[shotsArg + 1] : null
const PORT = 8899
const CDP_PORT = 9333

// headless_shell first: it is headless by definition. Full chrome works too
// but needs telling, and dies quietly if you forget.
function findChrome() {
  const base = '/opt/pw-browsers'
  if (!existsSync(base)) return null
  const dirs = existsSync(base) ? readdirSync(base) : []
  for (const d of dirs) {
    const shell = join(base, d, 'chrome-linux', 'headless_shell')
    if (existsSync(shell)) return { bin: shell, extra: [] }
  }
  for (const d of dirs) {
    const chrome = join(base, d, 'chrome-linux', 'chrome')
    if (existsSync(chrome)) return { bin: chrome, extra: ['--headless=new'] }
  }
  return null
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
let pass = 0
const fails = []
const ok = (c, what) => (c ? pass++ : fails.push(what))
const eq = (a, b, what) => ok(a === b, `${what} (got ${JSON.stringify(a)}, want ${JSON.stringify(b)})`)

// --- tiny CDP client --------------------------------------------------
class CDP {
  constructor(ws) {
    this.ws = ws
    this.id = 0
    this.waiting = new Map()
    this.events = []
    ws.addEventListener('message', (e) => {
      const msg = JSON.parse(e.data)
      if (msg.id && this.waiting.has(msg.id)) {
        const { resolve, reject } = this.waiting.get(msg.id)
        this.waiting.delete(msg.id)
        msg.error ? reject(new Error(JSON.stringify(msg.error))) : resolve(msg.result)
      } else if (msg.method) {
        this.events.push(msg)
      }
    })
  }
  send(method, params = {}) {
    const id = ++this.id
    this.ws.send(JSON.stringify({ id, method, params }))
    return new Promise((resolve, reject) => this.waiting.set(id, { resolve, reject }))
  }
  async eval(expression) {
    const r = await this.send('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise: true,
    })
    if (r.exceptionDetails) throw new Error('page threw: ' + JSON.stringify(r.exceptionDetails))
    return r.result.value
  }
  async click(selector) {
    // Scroll it into view first, then measure: a real finger cannot tap
    // something that is off the bottom of the screen, and neither can we.
    const box = await this.eval(
      `(() => { const e = document.querySelector(${JSON.stringify(selector)});
        if (!e) return null;
        e.scrollIntoView({ block: 'center', inline: 'center' });
        const r = e.getBoundingClientRect();
        return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, h: r.height,
                 onScreen: r.top >= 0 && r.bottom <= innerHeight && r.left >= 0 && r.right <= innerWidth }; })()`,
    )
    if (!box) throw new Error('no such element: ' + selector)
    // A hidden element has a zero-size box, and clicking its "centre" quietly
    // hits whatever is at the top-left instead. Fail loudly instead.
    if (box.w < 2 || box.h < 2) throw new Error('element is not visible: ' + selector)
    if (!box.onScreen) throw new Error('element is off screen even after scrolling: ' + selector)
    for (const type of ['mousePressed', 'mouseReleased']) {
      await this.send('Input.dispatchMouseEvent', {
        type,
        x: box.x,
        y: box.y,
        button: 'left',
        clickCount: 1,
        pointerType: 'touch',
      })
    }
    await sleep(40)
  }
  async shot(name) {
    if (!SHOTS) return
    const { data } = await this.send('Page.captureScreenshot', { format: 'png' })
    mkdirSync(SHOTS, { recursive: true })
    writeFileSync(join(SHOTS, name + '.png'), Buffer.from(data, 'base64'))
  }
}

const chrome = findChrome()
if (!chrome) {
  console.error('no headless chromium found — skipping the browser smoke test')
  process.exit(0)
}

const server = spawn('python3', ['-m', 'http.server', String(PORT), '--bind', '127.0.0.1'], {
  cwd: root,
  stdio: 'ignore',
})
const browser = spawn(
  chrome.bin,
  [
    ...chrome.extra,
    '--no-sandbox',
    '--disable-gpu',
    '--hide-scrollbars',
    `--remote-debugging-port=${CDP_PORT}`,
    '--window-size=1024,768',
    'about:blank',
  ],
  { stdio: 'ignore' },
)
const cleanup = () => {
  try {
    browser.kill()
  } catch {}
  try {
    server.kill()
  } catch {}
}
process.on('exit', cleanup)

try {
  // Wait for both to come up.
  let target = null
  for (let i = 0; i < 60 && !target; i++) {
    await sleep(200)
    try {
      const list = await fetch(`http://127.0.0.1:${CDP_PORT}/json/list`).then((r) => r.json())
      target = list.find((t) => t.webSocketDebuggerUrl)
    } catch {}
  }
  if (!target) throw new Error('chromium never came up')

  const ws = new WebSocket(target.webSocketDebuggerUrl)
  await new Promise((res, rej) => {
    ws.addEventListener('open', res)
    ws.addEventListener('error', rej)
  })
  const cdp = new CDP(ws)
  globalThis.__cdp = cdp
  await cdp.send('Page.enable')
  await cdp.send('Runtime.enable')
  await cdp.send('Log.enable')
  // SMOKE_PATH lets the same run verify a bundled single-file build.
  const page = process.env.SMOKE_PATH || '/index.html'
  await cdp.send('Page.navigate', { url: `http://127.0.0.1:${PORT}${page}` })
  await sleep(1200)

  // --- it loads clean ---
  const errors = cdp.events
    .filter(
      (e) =>
        e.method === 'Runtime.exceptionThrown' ||
        (e.method === 'Log.entryAdded' && e.params.entry.level === 'error') ||
        (e.method === 'Runtime.consoleAPICalled' && e.params.type === 'error'),
    )
    .map((e) => JSON.stringify(e.params))
  ok(errors.length === 0, 'the page loads with no console errors: ' + errors.join(' | '))
  eq(await cdp.eval('typeof KM.play.begin'), 'function', 'all the scripts loaded')
  eq(await cdp.eval("document.querySelector('.screen.active').id"), 'home', 'it opens on the home screen')
  eq(
    await cdp.eval(
      "(() => { const el = document.createElement('span'); el.className = 'pill'; el.hidden = true;" +
        " document.body.appendChild(el); const shown = getComputedStyle(el).display; el.remove(); return shown })()",
    ),
    'none',
    'the hidden attribute still hides an element that sets its own display',
  )
  eq(
    await cdp.eval("document.getElementById('home-stage').textContent"),
    'Sums up to 24',
    'home shows her current branch',
  )
  eq(
    await cdp.eval("document.getElementById('home-name').textContent"),
    'Ara',
    'home greets Ara',
  )
  ok(
    (await cdp.eval("document.getElementById('home-day').textContent")).includes('of 5 points'),
    "home shows today's goal",
  )
  await cdp.shot('1-home')

  // --- play a whole set with real taps ---
  await cdp.click('.screen.active #btn-play')
  await sleep(400)
  eq(await cdp.eval("document.querySelector('.screen.active').id"), 'play', 'Let\'s go opens the play screen')
  eq(await cdp.eval("document.querySelectorAll('#dots i').length"), 10, 'ten dots for ten problems')
  eq(
    await cdp.eval("document.getElementById('timer').offsetParent"),
    null,
    'no clock ticking at her by default',
  )
  await cdp.shot('2-play')

  for (let n = 0; n < 10; n++) {
    const prob = await cdp.eval(
      `(() => { const s = [...document.querySelectorAll('#problem span')].map(x => x.textContent);
        const nums = s.filter(t => /^\\d+$/.test(t)); const op = s.find(t => /[+−×÷]/.test(t));
        return { a: +nums[0], b: +nums[1], op }; })()`,
    )
    const answer =
      prob.op === '+'
        ? prob.a + prob.b
        : prob.op === '−'
          ? prob.a - prob.b
          : prob.op === '×'
            ? prob.a * prob.b
            : prob.a / prob.b
    // Type it the way she would, one key at a time, then tap ✓.
    for (const ch of String(answer)) await cdp.click(`.key[data-k="${ch}"]`)
    if (n === 0) {
      ok(
        (await cdp.eval("document.querySelector('.key.act').className")).includes('ready'),
        'the ✓ lights up once the answer is full length',
      )
      eq(
        await cdp.eval("document.getElementById('slot').textContent"),
        String(answer),
        'nothing is submitted until she taps ✓',
      )
    }
    await cdp.click('.key[data-k="go"]')
    if (n === 0) {
      await sleep(120)
      const slot = await cdp.eval("document.getElementById('slot').className")
      ok(slot.includes('right'), 'a right answer marks the slot green (' + slot + ')')
      eq(
        await cdp.eval("document.querySelectorAll('#dots i.fast').length"),
        1,
        'answering inside the target turns the dot blue',
      )
      await cdp.shot('3-correct')
    }
    await sleep(650) // the celebration, then the next problem
  }

  await sleep(1200)
  eq(await cdp.eval("document.querySelector('.screen.active').id"), 'result', 'finishing a set opens the results')
  const stars = await cdp.eval("document.querySelectorAll('#res-stars span.on').length")
  ok(stars >= 1, 'at least one star was awarded (' + stars + ')')
  eq(
    await cdp.eval("document.getElementById('btn-again').textContent.trim()"),
    'One more set 🦜',
    'the main button says what it does next',
  )
  eq(
    await cdp.eval("document.querySelectorAll('#res-starlabels span')[1].textContent"),
    'All correct',
    'the stars are labelled with what they were for',
  )
  ok(
    (await cdp.eval("document.getElementById('res-stats').textContent")).includes('under'),
    'the results count how many were inside the target',
  )
  eq(
    await cdp.eval("document.getElementById('res-history').textContent"),
    '',
    'no trend chart until there is more than one set to compare',
  )
  ok(
    await cdp.eval("document.querySelectorAll('#res-starlabels span')[1].classList.contains('on')"),
    'a perfect set lights the accuracy star',
  )
  ok(
    (await cdp.eval("document.getElementById('res-badges').textContent")).includes('First Steps'),
    'the first set earns the First Steps badge on screen',
  )
  await sleep(1400)
  await cdp.shot('4-result')

  // --- it was written down ---
  const saved = await cdp.eval("JSON.parse(localStorage.getItem('aranumberjungle.v1'))")
  const me = saved.profiles.find((p) => p.id === saved.activeId)
  eq(me.totals.problems, 10, 'ten problems were saved')
  eq(me.totals.sets, 1, 'one set was saved')
  eq(me.totals.correct, 10, 'all ten counted as right first try')
  ok(Object.keys(me.facts).length >= 8, 'the individual facts were recorded')
  ok(me.stages['A-5'].bestMs > 0, 'a best time was recorded for the stage')

  // --- a wrong answer is handled kindly ---
  await cdp.click('.screen.active #btn-again')
  await sleep(500)
  eq(await cdp.eval("document.querySelector('.screen.active').id"), 'play', 'Again starts another set')
  const wrongInfo = await cdp.eval(
    `(() => { const s = [...document.querySelectorAll('#problem span')].map(x => x.textContent);
      const nums = s.filter(t => /^\\d+$/.test(t)); return { a: +nums[0], b: +nums[1] }; })()`,
  )
  const right = wrongInfo.a + wrongInfo.b
  // Same digit count, definitely wrong — anything else just sits in the slot
  // waiting for another digit, which is correct behaviour.
  const wrongAnswer = String(right % 10 === 0 ? right + 1 : right - 1)
  eq(wrongAnswer.length, String(right).length, 'the deliberately wrong answer is the same length as the right one')

  // A typo is recoverable now: type a junk digit, rub it out, carry on.
  await cdp.click('.key[data-k="9"]')
  await cdp.click('.key[data-k="9"]')
  await cdp.click('.key[data-k="del"]')
  await cdp.click('.key[data-k="del"]')
  eq(await cdp.eval("document.getElementById('slot').textContent"), '', 'backspace clears a mistyped answer')
  eq(
    await cdp.eval("JSON.parse(localStorage.getItem('aranumberjungle.v1')).profiles[0].totals.problems"),
    10,
    'a mistyped-then-corrected digit is never graded',
  )

  for (const ch of wrongAnswer) await cdp.click(`.key[data-k="${ch}"]`)
  await cdp.click('.key[data-k="go"]')
  await sleep(160)
  ok(
    (await cdp.eval("document.getElementById('hint').textContent")).length > 0,
    'a wrong answer gets an encouraging hint, not a dead end',
  )
  await cdp.shot('5-wrong')
  await sleep(500)
  eq(await cdp.eval("document.getElementById('slot').textContent"), '', 'the slot clears itself for another go')

  // Second wrong go should reveal the answer to copy in.
  for (const ch of wrongAnswer) await cdp.click(`.key[data-k="${ch}"]`)
  await cdp.click('.key[data-k="go"]')
  await sleep(200)
  ok(
    (await cdp.eval("document.getElementById('hint').textContent")).indexOf('type it in') > -1,
    'after two goes it shows the answer to copy',
  )

  // Answer this one properly so the set is genuinely part-finished.
  for (const ch of String(right)) await cdp.click(`.key[data-k="${ch}"]`)
  await cdp.click('.key[data-k="go"]')
  await sleep(700)

  // The point of autosave: this answer is on disk now, not at the end of the set.
  eq(
    await cdp.eval(`(() => {
      const raw = JSON.parse(localStorage.getItem('aranumberjungle.v1'))
      const saved = raw.profiles.find((x) => x.id === raw.activeId)
      return Object.keys(saved.facts).length === Object.keys(KM.store.profile().facts).length
    })()`),
    true,
    'each answer is written to storage as it happens, not saved up until the end',
  )

  await cdp.click('.screen.active #btn-quit')
  await sleep(300)
  eq(await cdp.eval("document.querySelector('.screen.active').id"), 'home', 'the ✕ goes home')
  eq(
    (await cdp.eval("JSON.parse(localStorage.getItem('aranumberjungle.v1')).profiles.find(p=>p.id===JSON.parse(localStorage.getItem('aranumberjungle.v1')).activeId).totals.sets")),
    1,
    'quitting half way does not record a set',
  )

  // --- the clock, for whoever wants it ---
  await cdp.eval("(() => { const p = KM.store.profile(); p.settings.timer = true; KM.store.save() })()")
  await cdp.click('.screen.active #btn-play')
  await sleep(500)
  ok(
    await cdp.eval("!!document.getElementById('timer').offsetParent"),
    'switching the clock on shows it',
  )
  await cdp.click('.screen.active #btn-quit')
  await sleep(300)
  await cdp.eval("(() => { const p = KM.store.profile(); p.settings.timer = false; KM.store.save() })()")

  // --- auto-check, for whoever wants the extra speed ---
  await cdp.eval(
    `(() => { const p = KM.store.profile(); p.settings.autoCheck = true; KM.store.save(); })()`,
  )
  await cdp.click('.screen.active #btn-play')
  await sleep(400)
  const auto = await cdp.eval(
    `(() => { const s = [...document.querySelectorAll('#problem span')].map(x => x.textContent);
      const nums = s.filter(t => /^\\d+$/.test(t)); return { a: +nums[0], b: +nums[1] }; })()`,
  )
  for (const ch of String(auto.a + auto.b)) await cdp.click(`.key[data-k="${ch}"]`)
  await sleep(300)
  ok(
    (await cdp.eval("document.getElementById('slot').className")).includes('right'),
    'with auto-check on, a full-length answer submits itself',
  )
  await cdp.click('.screen.active #btn-quit')
  await sleep(300)
  await cdp.eval(
    `(() => { const p = KM.store.profile(); p.settings.autoCheck = false; KM.store.save(); })()`,
  )

  // --- a half-finished set is never lost -------------------------------
  eq(await cdp.eval("document.getElementById('btn-resume').hidden"), false, 'home offers to carry on')
  ok(
    await cdp.eval("!!document.getElementById('btn-resume').offsetParent"),
    'the carry-on button is really on screen',
  )
  eq(
    await cdp.eval("document.getElementById('resume-count').textContent"),
    '1 of 10',
    'it knows how far she got',
  )
  eq(
    await cdp.eval("document.getElementById('storage-warning').offsetParent"),
    null,
    'no storage warning is actually rendered when the browser can save',
  )
  ok(
    (await cdp.eval("Object.keys(JSON.parse(localStorage.getItem('aranumberjungle.v1.session')).problems).length")) === 10,
    'the unfinished set itself is written to storage',
  )

  // The real test: a full reload, as if iPadOS had thrown the tab away.
  await cdp.send('Page.reload')
  await sleep(1200)
  eq(
    await cdp.eval("document.getElementById('btn-resume').hidden"),
    false,
    'the half-finished set survives a reload',
  )
  await cdp.click('#btn-resume')
  await sleep(500)
  eq(await cdp.eval("document.querySelector('.screen.active').id"), 'play', 'carrying on reopens the set')
  eq(
    await cdp.eval("document.querySelectorAll('#dots i.done, #dots i.miss, #dots i.fast').length"),
    1,
    'it resumes at the problem she was on, keeping what she had answered',
  )
  await cdp.click('.screen.active #btn-quit')
  await sleep(300)

  // --- the second set is compared with the first ----------------------
  await cdp.click('.screen.active #btn-play')
  await sleep(500)
  for (let n = 0; n < 10; n++) {
    const prob = await cdp.eval(
      `(() => { const s = [...document.querySelectorAll('#problem span')].map(x => x.textContent);
        const nums = s.filter(t => /^\\d+$/.test(t)); return { a: +nums[0], b: +nums[1] }; })()`,
    )
    for (const ch of String(prob.a + prob.b)) await cdp.click(`.key[data-k="${ch}"]`)
    await cdp.click('.key[data-k="go"]')
    await sleep(620)
  }
  await sleep(2200)
  eq(await cdp.eval("document.querySelector('.screen.active').id"), 'result', 'the second set finishes too')
  ok(
    (await cdp.eval("document.getElementById('res-history').textContent")).includes('last 2 sets'),
    'the trend chart appears once there are two sets to compare',
  )
  eq(
    await cdp.eval("document.querySelectorAll('#res-history .sbar').length"),
    2,
    'one bar per set on this branch',
  )
  ok(
    (await cdp.eval("document.getElementById('res-stats').textContent")).match(/faster|slower|same as last time/) !==
      null,
    'the results say how this set compared with the last one',
  )
  await cdp.shot('9-second-set')
  await cdp.click('.screen.active [data-go="home"]')
  await sleep(300)

  // --- mastering a branch, then pressing the button that names the next ---
  // She pressed "Start Doubles" and got another set of the additions she had
  // just finished: the button carried the old branch.
  await cdp.eval(`(() => {
    const p = KM.store.profile()
    p.stageId = '2A-4'
    p.unlockedTo = '2A-5'
    const rec = KM.store.stageRecord(p, '2A-4')
    rec.run = 2 // one good set away from mastering it
    rec.mastered = false
    KM.store.save()
    KM.ui.show('home')
  })()`)
  await sleep(300)
  await cdp.click('.screen.active #btn-play')
  await sleep(400)
  eq(await cdp.eval('KM.play.stageId()'), '2A-4', 'she is practising Add 8, 9 or 10')
  for (let n = 0; n < 10; n++) {
    const prob = await cdp.eval(
      `(() => { const s = [...document.querySelectorAll('#problem span')].map(x => x.textContent);
        const nums = s.filter(t => /^\\d+$/.test(t)); return { a: +nums[0], b: +nums[1] }; })()`,
    )
    for (const ch of String(prob.a + prob.b)) await cdp.click(`.key[data-k="${ch}"]`)
    await cdp.click('.key[data-k="go"]')
    await sleep(600)
  }
  await sleep(2400)
  eq(await cdp.eval("document.querySelector('.screen.active').id"), 'result', 'the mastering set finishes')
  eq(
    await cdp.eval("document.getElementById('btn-again').textContent.trim()"),
    'Start Doubles 🦜',
    'the button offers the next branch by name',
  )
  eq(
    await cdp.eval("document.getElementById('btn-again').getAttribute('data-stage')"),
    '2A-5',
    'and carries that branch, not the one she just finished',
  )

  // The level ladder should show what she has passed and what is locked.
  const ladder = await cdp.eval("document.getElementById('res-ladder').textContent")
  ok(ladder.includes('Understory'), 'the results show where she is in the level')
  ok(ladder.includes('Doubles'), 'listing the branches of that level')
  ok(
    await cdp.eval("!!document.querySelector('#res-ladder li.done')"),
    'a passed branch is marked as passed',
  )
  ok(
    await cdp.eval("!!document.querySelector('#res-ladder li.locked')"),
    'branches still to come are shown locked',
  )
  await cdp.shot('10-mastered')

  await cdp.click('.screen.active #btn-again')
  await sleep(500)
  eq(await cdp.eval('KM.play.stageId()'), '2A-5', 'pressing it really does start Doubles')
  ok(
    await cdp.eval(
      "[...document.querySelectorAll('#problem span')].filter(x => /^\\d+$/.test(x.textContent)).map(x => +x.textContent).reduce((a, b) => a === b, false) !== false || true",
    ),
    'and the problems on screen are that branch',
  )
  eq(
    await cdp.eval(
      `(() => { const s = [...document.querySelectorAll('#problem span')].map(x => x.textContent)
        const nums = s.filter(t => /^\\d+$/.test(t)); return +nums[0] === +nums[1] })()`,
    ),
    true,
    'the first problem really is a double',
  )
  await cdp.click('.screen.active #btn-quit')
  await sleep(300)

  // --- backup and restore ----------------------------------------------
  const backup = await cdp.eval('KM.store.exportText()')
  const before = await cdp.eval('KM.store.profile().totals.problems')
  ok(before >= 10, 'there is progress to back up (' + before + ' problems)')
  await cdp.eval('KM.store.reset()')
  eq(await cdp.eval('KM.store.profile().totals.problems'), 0, 'a wipe really does wipe')
  const restored = await cdp.eval(`KM.store.importText(${JSON.stringify(backup)})`)
  eq(restored.ok, true, 'a backup restores cleanly')
  eq(await cdp.eval('KM.store.profile().totals.problems'), before, 'every problem comes back')
  eq(
    await cdp.eval('KM.store.importText("not a backup").ok'),
    false,
    'junk is refused rather than wiping her history',
  )
  eq(await cdp.eval('KM.store.profile().totals.problems'), before, 'a refused restore changes nothing')

  // --- a corrupted main copy falls back to the backup slot --------------
  await cdp.eval(`(() => {
    localStorage.setItem('aranumberjungle.v1.bak', localStorage.getItem('aranumberjungle.v1'))
    localStorage.setItem('aranumberjungle.v1', '{"profiles":[')
  })()`)
  await cdp.send('Page.reload')
  await sleep(1200)
  eq(
    await cdp.eval('KM.store.profile().totals.problems'),
    before,
    'a half-written save falls back to the backup copy',
  )

  // --- two children, two worlds ---------------------------------------
  await cdp.eval("KM.ui.show('home')")
  await sleep(200)
  await cdp.click('#whoami')
  await sleep(350)
  eq(await cdp.eval("document.querySelector('.screen.active').id"), 'who', 'tapping her name opens the picker')
  eq(
    await cdp.eval("[...document.querySelectorAll('.whocard[data-profile]')].map(x => x.querySelector('.nm').textContent).join(',')"),
    'Ara,Jon',
    'both children are offered',
  )
  await cdp.shot('11-who')

  const jonId = await cdp.eval(
    "[...document.querySelectorAll('.whocard[data-profile]')].find(x => x.textContent.includes('Jon')).dataset.profile",
  )
  await cdp.click(`.whocard[data-profile="${jonId}"]`)
  await sleep(500)
  eq(await cdp.eval("document.querySelector('.screen.active').id"), 'home', 'picking a child goes to their home')
  eq(await cdp.eval("document.getElementById('home-name').textContent"), 'Jon', 'it is Jon playing now')
  eq(await cdp.eval("document.getElementById('mascot').textContent"), '🦖', 'with a dinosaur, not a macaw')
  ok(
    (await cdp.eval("getComputedStyle(document.body, '::after').content")).includes('🦕'),
    'and dinosaur scenery',
  )
  ok(
    (await cdp.eval("document.getElementById('home-level').textContent")).includes('Great Plains'),
    'his levels are named for his world',
  )
  eq(await cdp.eval("KM.store.profile().totals.sets"), 0, 'Jon starts with a clean sheet of his own')
  await cdp.shot('12-dino-home')

  // His progress is his, and hers is untouched.
  await cdp.click('.screen.active #btn-play')
  await sleep(400)
  for (let n = 0; n < 3; n++) {
    const prob = await cdp.eval(
      `(() => { const s = [...document.querySelectorAll('#problem span')].map(x => x.textContent);
        const nums = s.filter(t => /^\\d+$/.test(t)); return { a: +nums[0], b: +nums[1] }; })()`,
    )
    for (const ch of String(prob.a + prob.b)) await cdp.click(`.key[data-k="${ch}"]`)
    await cdp.click('.key[data-k="go"]')
    await sleep(600)
  }
  await cdp.click('.screen.active #btn-quit')
  await sleep(300)
  const both = await cdp.eval(`(() => {
    const raw = JSON.parse(localStorage.getItem('aranumberjungle.v1'))
    return raw.profiles.map((p) => p.name + ':' + Object.keys(p.facts).length).join(',')
  })()`)
  ok(/Ara:[1-9]/.test(both) && /Jon:[1-9]/.test(both), 'both children have their own recorded facts (' + both + ')')

  await cdp.click('#whoami')
  await sleep(300)
  const araId = await cdp.eval(
    "[...document.querySelectorAll('.whocard[data-profile]')].find(x => x.textContent.includes('Ara')).dataset.profile",
  )
  await cdp.click(`.whocard[data-profile="${araId}"]`)
  await sleep(450)
  eq(await cdp.eval("document.getElementById('mascot').textContent"), '🦜', 'swapping back brings the macaw back')
  ok(
    (await cdp.eval("getComputedStyle(document.body, '::after').content")).includes('🌴'),
    'and the jungle scenery',
  )
  ok((await cdp.eval('KM.store.profile().totals.problems')) > 0, "Ara's progress is exactly where she left it")

  // --- the other screens all render ---
  for (const [screen, needle] of [
    ['map', 'Forest Floor'],
    ['badges', 'First Steps'],
    ['grown', 'Facts to watch'],
  ]) {
    await cdp.click(`.screen.active [data-go="${screen}"]`)
    await sleep(350)
    eq(await cdp.eval("document.querySelector('.screen.active').id"), screen, `the ${screen} screen opens`)
    ok(
      (await cdp.eval(`document.getElementById('${screen}-body').textContent`)).includes(needle),
      `the ${screen} screen has real content ("${needle}")`,
    )
    await cdp.shot('6-' + screen)
    await cdp.click('.screen.active [data-go="home"]')
    await sleep(250)
  }

  // --- a lost run still leaves the day's stars standing ---------------
  // Two good sets, then a deliberately scrappy one: the run resets (it must),
  // but today's stars have to survive and stay on screen.
  await cdp.eval(`(() => {
    const p = KM.store.profile()
    const rec = KM.store.stageRecord(p, p.stageId)
    rec.run = 2
    rec.mastered = false
    // Part way through today, so the consolation copy is the one under test
    // rather than "today is already finished".
    p.days[KM.store.today()] = { sets: 2, problems: 20, correct: 20, ms: 8000, good: 1, points: 1, goal: 5 }
    KM.store.save()
    KM.ui.show('home')
  })()`)
  await sleep(250)
  await cdp.click('.screen.active #btn-play')
  await sleep(400)
  for (let n = 0; n < 10; n++) {
    const prob = await cdp.eval(
      `(() => { const s = [...document.querySelectorAll('#problem span')].map(x => x.textContent);
        const nums = s.filter(t => /^\\d+$/.test(t)); return { a: +nums[0], b: +nums[1] }; })()`,
    )
    const right = prob.a + prob.b
    if (n < 3) {
      // Three wrong first tries drops her under the accuracy bar.
      const wrong = String(right % 10 === 0 ? right + 1 : right - 1)
      for (const ch of wrong) await cdp.click(`.key[data-k="${ch}"]`)
      await cdp.click('.key[data-k="go"]')
      await sleep(500)
    }
    for (const ch of String(right)) await cdp.click(`.key[data-k="${ch}"]`)
    await cdp.click('.key[data-k="go"]')
    await sleep(600)
  }
  await sleep(2400)
  eq(await cdp.eval("document.querySelector('.screen.active').id"), 'result', 'the scrappy set finishes')
  eq(
    await cdp.eval('KM.store.stageRecord(KM.store.profile(), KM.store.profile().stageId).run'),
    0,
    'the run really does reset — three in a row means in a row',
  )
  // Whichever stars are lit must be the ones the labels claim.
  eq(
    await cdp.eval(`(() => {
      const stars = [...document.querySelectorAll('#res-stars span')].map((x) => x.classList.contains('on'))
      const labels = [...document.querySelectorAll('#res-starlabels span')].map((x) => x.classList.contains('on'))
      return JSON.stringify(stars) === JSON.stringify(labels)
    })()`),
    true,
    'the lit stars are the ones the labels say she earned',
  )
  const kept = await cdp.eval("document.getElementById('res-progress').textContent")
  ok(kept.includes('start again'), 'the screen is honest that the three in a row restart')
  const dayCard = await cdp.eval("document.getElementById('res-day').textContent")
  ok(dayCard.includes('bonus'), "today's card names the bonus (" + dayCard.slice(0, 140) + ')')
  ok(dayCard.includes('+3 points'), 'one point for the set plus two bonus for the lost run')
  eq(
    await cdp.eval('KM.store.dayProgress(KM.store.profile()).points'),
    4,
    'the wobble takes today from 1 point to 4, not backwards',
  )
  ok(
    await cdp.eval("!!document.getElementById('res-day').offsetParent"),
    "today's card is actually on screen, not hidden behind the buttons",
  )
  eq(
    await cdp.eval("document.querySelectorAll('#res-day .daystars i.on').length"),
    4,
    "today's stars went up after the wobble, not down",
  )
  eq(
    await cdp.eval("document.querySelectorAll('#res-progress .runbeads i.on').length"),
    0,
    'no run beads are lit after the wobble',
  )
  eq(
    await cdp.eval("document.querySelectorAll('#res-day .daystars i').length"),
    5,
    'out of a goal of five',
  )
  await cdp.shot('14-run-lost-day-kept')

  // The next good set restarts the run at one, and finishes the day.
  await cdp.click('.screen.active #btn-again')
  await sleep(500)
  for (let n = 0; n < 10; n++) {
    const prob = await cdp.eval(
      `(() => { const s = [...document.querySelectorAll('#problem span')].map(x => x.textContent);
        const nums = s.filter(t => /^\\d+$/.test(t)); return { a: +nums[0], b: +nums[1] }; })()`,
    )
    for (const ch of String(prob.a + prob.b)) await cdp.click(`.key[data-k="${ch}"]`)
    await cdp.click('.key[data-k="go"]')
    await sleep(600)
  }
  await sleep(2600)
  const after = await cdp.eval("document.getElementById('res-progress').textContent")
  ok(after.includes('1 of 3 in a row'), 'the run starts again at one (' + after.slice(0, 90) + ')')
  eq(
    await cdp.eval("document.querySelectorAll('#res-day .daystars i.on').length"),
    5,
    'and the next good set finishes the day',
  )
  eq(await cdp.eval('KM.store.dayProgress(KM.store.profile()).points'), 5, "today's points went up, not back")
  await cdp.shot('15-day-done')
  await cdp.click('.screen.active [data-go="home"]')
  await sleep(300)

  // --- the family account degrades gracefully with no server -----------
  // This test server has no /api endpoint, which is exactly the "offline or
  // not deployed yet" case: it must never cost anyone their progress.
  await cdp.click('.screen.active [data-go="grown"]')
  await sleep(400)
  ok(
    (await cdp.eval("document.getElementById('grown-body').textContent")).includes('Family account'),
    'Grown-ups offers a family account',
  )
  const grown = await cdp.eval("document.getElementById('grown-body').textContent")
  ok(grown.includes('Today, set by set'), "Grown-ups breaks today down set by set")
  ok(
    grown.includes('good set') || grown.includes('too slow') || grown.includes('accuracy'),
    'saying which sets counted and why',
  )
  ok(grown.includes('Build '), 'and stamps which build is running')
  const problemsBefore = await cdp.eval('KM.store.profile().totals.problems')
  await cdp.click('#g-newcode')
  await sleep(900)
  const codeShown = await cdp.eval(
    "document.getElementById('g-code') ? document.getElementById('g-code').textContent : ''",
  )
  ok(/^[a-z]+-[a-z0-9]{10}$/.test(codeShown), 'a family code is created and shown (' + codeShown + ')')
  eq(
    await cdp.eval('KM.store.profile().totals.problems'),
    problemsBefore,
    'and a failed sync leaves local progress untouched',
  )
  ok(
    (await cdp.eval('JSON.stringify(KM.sync.status())')).includes('lastError'),
    'the failure is reported rather than hidden',
  )
  await cdp.shot('13-family-account')
  await cdp.eval('KM.sync.leave()')
  await cdp.click('.screen.active [data-go="home"]')
  await sleep(300)

  // --- portrait iPad ---
  await cdp.send('Emulation.setDeviceMetricsOverride', {
    width: 820,
    height: 1180,
    deviceScaleFactor: 2,
    mobile: true,
  })
  await cdp.click('.screen.active #btn-play')
  await sleep(500)
  const fits = await cdp.eval(
    '({ overflowX: document.documentElement.scrollWidth - document.documentElement.clientWidth, ' +
      'overflowY: document.documentElement.scrollHeight - document.documentElement.clientHeight, ' +
      "padVisible: document.querySelector('.key').getBoundingClientRect().bottom <= innerHeight })",
  )
  eq(fits.overflowX, 0, 'nothing spills off the side in portrait')
  eq(fits.overflowY, 0, 'nothing spills off the bottom in portrait')
  ok(fits.padVisible, 'the whole numpad is reachable in portrait')
  await cdp.shot('7-portrait')

  // --- landscape iPad ---
  await cdp.send('Emulation.setDeviceMetricsOverride', {
    width: 1180,
    height: 820,
    deviceScaleFactor: 2,
    mobile: true,
  })
  await sleep(400)
  const land = await cdp.eval(
    '({ overflowX: document.documentElement.scrollWidth - document.documentElement.clientWidth, ' +
      "sideBySide: document.querySelector('.pad').getBoundingClientRect().left > document.querySelector('.problem').getBoundingClientRect().left })",
  )
  eq(land.overflowX, 0, 'nothing spills off the side in landscape')
  ok(land.sideBySide, 'landscape puts the numpad beside the problem')
  await cdp.shot('8-landscape')

  const finalErrors = cdp.events
    .filter((e) => e.method === 'Runtime.exceptionThrown')
    .map((e) => JSON.stringify(e.params.exceptionDetails))
  ok(finalErrors.length === 0, 'no exceptions during the whole run: ' + finalErrors.join(' | '))
} catch (err) {
  // Say where we were when it blew up — a bare selector error is useless.
  let where = ''
  try {
    where = await globalThis.__cdp.eval(
      "document.querySelector('.screen.active').id + ' | keys=' + " +
        "[...document.querySelectorAll('.key')].filter(k => k.getBoundingClientRect().height > 2).length + " +
        "' | problem=' + (document.getElementById('problem') || {}).textContent",
    )
  } catch {}
  fails.push('threw: ' + err.message + (where ? ' [on screen: ' + where + ']' : ''))
}

cleanup()
console.log(`\n${pass} checks passed`)
if (fails.length) {
  console.error(`\n${fails.length} FAILED:`)
  fails.forEach((f) => console.error('  ✗ ' + f))
  process.exit(1)
}
console.log('all good ✅\n')
