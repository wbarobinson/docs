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
  await cdp.send('Page.navigate', { url: `http://127.0.0.1:${PORT}/index.html` })
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
  eq(await cdp.eval("document.getElementById('home-stage').textContent"), 'Add 11', 'home shows her current stage')
  eq(
    await cdp.eval("document.getElementById('home-name').textContent"),
    'Ara',
    'home greets Ara',
  )
  await cdp.shot('1-home')

  // --- play a whole set with real taps ---
  await cdp.click('.screen.active #btn-play')
  await sleep(400)
  eq(await cdp.eval("document.querySelector('.screen.active').id"), 'play', 'Let\'s go opens the play screen')
  eq(await cdp.eval("document.querySelectorAll('#dots i').length"), 10, 'ten dots for ten problems')
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
    // Type it the way she would, one key at a time.
    if (process.env.DEBUG_SMOKE)
      console.log(n, 'problem', prob.a, prob.op, prob.b, '=', answer, 'i=', await cdp.eval('KM.play.stageId() && document.querySelectorAll("#dots i.done,#dots i.miss").length'))
    for (const ch of String(answer)) await cdp.click(`.key[data-k="${ch}"]`)
    if (n === 0) {
      await sleep(120)
      const slot = await cdp.eval("document.getElementById('slot').className")
      ok(slot.includes('right'), 'a right answer marks the slot green (' + slot + ')')
      await cdp.shot('3-correct')
    }
    await sleep(650) // the celebration, then the next problem
  }

  await sleep(1200)
  eq(await cdp.eval("document.querySelector('.screen.active').id"), 'result', 'finishing a set opens the results')
  const stars = await cdp.eval("document.querySelectorAll('#res-stars span.on').length")
  ok(stars >= 1, 'at least one star was awarded (' + stars + ')')
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
  for (const ch of wrongAnswer) await cdp.click(`.key[data-k="${ch}"]`)
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
  await sleep(200)
  ok(
    (await cdp.eval("document.getElementById('hint').textContent")).indexOf('type it in') > -1,
    'after two goes it shows the answer to copy',
  )

  await cdp.click('.screen.active #btn-quit')
  await sleep(300)
  eq(await cdp.eval("document.querySelector('.screen.active').id"), 'home', 'the ✕ goes home')
  eq(
    (await cdp.eval("JSON.parse(localStorage.getItem('aranumberjungle.v1')).profiles.find(p=>p.id===JSON.parse(localStorage.getItem('aranumberjungle.v1')).activeId).totals.sets")),
    1,
    'quitting half way does not record a set',
  )

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
