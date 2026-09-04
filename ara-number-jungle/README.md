# Ara's Number Jungle 🦜 / Jon's Dino Valley 🦖

A numpad maths game for Ara, built for an iPad with no stylus. It is Kumon in
shape — a long ladder of narrow steps, ten-problem sets, and you only move up
when you are *both* accurate and quick — but it is a game to play, not a
worksheet to fill in.

Ara means macaw, so she is a scarlet macaw climbing the rainforest: Forest
Floor → Understory → Canopy → Treetops → Open Sky.

## Two children, two worlds

Tap the name in the top-left corner and the **Who's playing?** screen appears —
big cards, no menus, any child can swap themselves. Each child has their own
progress, badges, streaks, settings and starting branch, plus their own world:

| | Ara | Jon |
| --- | --- | --- |
| Mascot | 🦜 macaw | 🦖 dinosaur |
| Levels | Forest Floor → Understory → The Canopy → Treetops → Open Sky | Fern Beds → Mud Swamp → Great Plains → Volcano Slopes → Comet Sky |
| Scenery | palms and hibiscus | ferns, bones and volcanoes |
| Noise | a squawk | a roar |
| Moving up | a branch | a ridge |

The maths ladder underneath is identical — only names, colours, scenery and
noises differ. Add more children in **Grown-ups**, where you can also switch
anyone's world.

## Running it

It is plain HTML, CSS and JavaScript. No build step, no dependencies, no
network calls, nothing to install.

```sh
cd ara-number-jungle
python3 -m http.server 8000
# then open http://<your-computer>:8000 on the iPad, on the same wifi
```

Opening `index.html` directly works too, but a served page gets you offline
support and saved progress (Safari blocks storage on `file://`).

### Family account (progress that follows them anywhere)

One long random **family code** — no email, no password — keeps both children's
progress on the server. Type the same code on another iPad, a phone or a laptop
and everything follows them there, including a device whose browser has been
wiped.

Set it up in **Grown-ups → Family account** on the device that already has the
progress: *Create a family code*. The code is then shown on that screen — it
lives only in that browser, so nobody else (including whoever built this) can
look it up for you. Two ways to get it onto the second device:

- **Copy invite link** and send it over (AirDrop, Messages, email). Opening the
  link joins that family automatically and strips the code out of the address
  bar. No typing.
- **Copy code** and type it into *Join* on the other device.

Joining **adds** to what is already on that device rather than replacing it.

How it holds up when two children practise on two devices at once:

- Every finished set is written to an append-only log with its own id, and the
  totals are derived from that log. Merging two devices takes the union of
  their logs, so a set can never be counted twice or dropped.
- Writes are compare-and-set. A device that was offline gets its copy back with
  a conflict, merges, and pushes the union — nobody's evening of practice is
  overwritten.
- Mastered branches, badges and best times never go backwards through a merge.
- If the server is unreachable the app carries on exactly as before, records
  the error in Grown-ups, and syncs when it can. **Local storage is always the
  source of truth; sync only ever adds.**

Check the server side with `https://<your-site>/api/progress?health=1` — it
reports whether durable storage is actually working.

### Host it somewhere permanent (recommended)

Progress is stored by the browser against the exact web address the app is
served from. A preview URL that changes when the page is republished takes the
progress with it. **Give it one permanent address and this stops happening.**

The folder is a static site with no build step, so:

- **Netlify, with the family account:**

  ```sh
  npm install
  npx netlify deploy --prod
  ```

  `netlify.toml` sets the publish directory, the functions directory and the
  `/api/*` redirect. Functions need their dependency installed, so this path
  (or a Git-connected site, which runs `npm install` for you) is what gives you
  sync.

- **Netlify Drop** (drag the folder onto <https://app.netlify.com/drop>) gets
  the app itself running in seconds with a permanent address, which is already
  enough to stop progress disappearing. The `/api` endpoint will not work
  there, so the family account stays switched off until you deploy with the CLI
  or connect the repo.

- **Vercel:** `npx vercel --prod`. `vercel.json` is here; the Netlify function
  would need porting to `api/` for sync to work there.

Then bookmark that address on the iPad and add it to the home screen. Nothing
about the app changes when you redeploy — same address, same stored progress.

### One file, no server

```sh
node tools/bundle.mjs
```

builds `dist/ara-number-jungle.html` — the whole app (styles, scripts, icons,
leaf art) inlined into a single 117kb file. AirDrop that to the iPad and open
it from Files, or drop it on any host. `dist/ara-number-jungle.artifact.html`
is the same thing without the document wrapper, for hosts that supply their
own. Rebuild it after changing anything in `js/` or `css/`.

**Put it on her home screen:** open it in Safari → Share → *Add to Home
Screen*. It then launches full-screen with no browser chrome, and works with
the wifi off. To host it permanently, drop the folder on any static host
(GitHub Pages, Netlify, Vercel) — there is no server side.

## Where she starts

The default starting branch is **Level A · Sums up to 24** — adding a small
number to numbers in the twenties, total no more than 24. Everything below it
is unlocked for confidence sets, everything above is locked until she gets
there.

If that is off by a branch or two, change it in **Grown-ups → Where she is**;
the picker lists the whole ladder. Nothing else needs adjusting — targets and
mastery follow the branch she is on.

### How faithful is this to Kumon?

The *shape* is Kumon's: narrow steps, ten-problem sets, and moving up only
when she is both accurate and quick. The *step boundaries* in Level A follow
Kumon's published organising principle for early addition — sections bounded
by the ceiling the sum may reach (12, 15, 18, 20, 24, 28) rather than by which
number is being added — with 2A as adding up to 10 and A running horizontal
addition before subtraction.

It is **not** a transcription of Kumon's worksheet-by-worksheet table, which
is not public. If her record book says something specific, the ladder should
be bent to match it: the branches live in one array in `js/curriculum.js`, and
each is four fields and a generator.

Two extra branches, **Add 10** and **Add 11** (to numbers over 24), sit after
the addition summary as a bridge toward two-digit work.

## The ladder

46 branches across five levels. Each has its own problem generator, so a
branch can only ever produce the kind of question it describes.

| Level | Place | Covers | Branches |
| --- | --- | --- | --- |
| 3A | Forest Floor | Adding 1, 2 and 3 | 6 |
| 2A | Understory | Adding up to 10, friends of 10, doubles | 6 |
| A | The Canopy | Sums to 12, 15, 18, 20, 24, 28; +10 and +11; taking away to 9 | 14 |
| B | Treetops | Carrying, borrowing, three digits | 10 |
| C | Open Sky | Times tables, 2-digit × 1-digit, sharing | 10 |

## How moving up works

- A **set** is 10 problems (5 or 20 if you prefer — a setting).
- A set is **quick** if she averages under the branch's target seconds per
  problem, and **accurate** if 9 of 10 are right first try.
- **Three quick, accurate sets in a row** masters the branch and moves her up.
  One slow or scrappy set resets the run: "in a row" is the point of it, and
  nothing is carried over.
- **The day is where a lost run is made good.** Finishing any set earns **1
  point**. A set that breaks a run pays **a bonus point for each good set the
  run had**. Five points finishes the day (settable to 3 or 8). So:

  | | run | points | today |
  | --- | --- | --- | --- |
  | ⭐⭐⭐ good set | 1 | +1 | 1 |
  | ⭐⭐⭐ good set | 2 | +1 | 2 |
  | ⭐⭐ wobble | **0** | **+3** (1 + 2 bonus) | **5 — day done 🎉** |

  Three clean sets in a row is 3 points *and* a move up. Two good then a
  wobble is **5 points** — the run is gone, but the evening counted for
  *more*, not less. Points are never taken away, and the results screen puts a
  **Today** card above the branch card so the first thing she reads after a
  miss is *"+3 points for that set — 1 for finishing it, and 2 bonus for the 2
  good sets the wobble cost you."* Finishing a day gets its own celebration and
  three badges.

  One thing to know as a parent: because the bonus exists, a wobbly evening
  fills the day faster than a clean one. Moving up a branch is still the bigger
  prize, so the incentive points the right way — but it is a deliberate trade,
  not an accident.
- **Stars** are per set: ⭐⭐⭐ quick and near-perfect, ⭐⭐ solid, ⭐ finished it.

Timing counts thinking time only — from a problem appearing to the right
answer, wrong goes included. The confetti between problems is not charged to
her.

## Answering

She types the answer on the numpad and taps the big green **✓**, which starts
pulsing as soon as what she has typed is as long as the answer needs to be.
The extra tap buys her the ability to notice a fat-fingered digit and rub it
out with ⌫ before it counts — a typo should not become a wrong answer, a
broken streak and a bogus entry in "facts to watch".

If she would rather race, **Grown-ups → Check the answer without tapping ✓**
submits automatically the moment the answer is full length. Faster, fewer
taps, no undo.

## Never losing progress

- Every answer is written to storage **as it happens**, not at the end of a set.
- A set she is part way through is snapshotted too, so an app switch, a reload
  or tapping ✕ leaves a **Carry on 🪶 (4 of 10)** button waiting on the home
  screen. It keeps what she had already answered.
- Each save rolls the previous good copy into a backup slot. If the main copy
  is ever half-written, the app loads the backup instead of starting over.
- **Grown-ups → Backup** shows a block of text that is her entire history.
  Copy it into an email or a note; pasting it into the Restore box on any
  device brings everything back.
- If the browser refuses to store anything at all (a `file://` page, a private
  window), the home screen says so instead of quietly forgetting.

## What she sees after a set

- **Where she is in the level**, down the left: ⭐ branches passed, 🦜 the one
  she is on, ⚪ open but not passed, 🔒 still to come.
- **How to graduate**, spelled out rather than implied: the two things a set
  has to do (9 of 10 right first try, and under the branch's target per
  problem), ticked or crossed against what she actually did, three beads for
  the run, and a plain sentence — *"That one counted! 2 of 3. One more and you
  fly up to Sums up to 28."*

- **Three stars, each with a name:** Finished, Accurate (9 of 10 right first
  try), Quick. Missing one tells her exactly what to aim at — a perfect but
  slow set is two stars, not one.
- The quick star counts either the branch target *or* beating her own best, so
  there is always a reachable goal even on a day the target is far off.
  Mastery still needs the real target, so the ladder does not get easier.
- **Faster than last time!** 9.2s → 8.5s, with the seconds she shaved off, and
  a bar chart of the last few sets on that branch so progress is visible across
  days.
- The next-set button says where it goes: *One more set* on the same branch, or
  *Start &lt;next branch&gt;* when she has just mastered one.

## Getting it wrong

Nothing bad happens. A soft low note, a wobble, the slot clears, try again.
After two goes it shows the answer for her to copy in, and moves on. Wrong
answers cost the streak and the star rating, never the ability to continue.

## Where the problems come from

Each branch has a finite pool — "sums up to 24" is 45 possible problems, "add
1" is nine. Picking at random meant the same dozen kept surfacing and a repeat
set felt like a fixed list. So each slot draws a handful of candidates and
takes the one she has **practised least recently**, which walks the whole pool
before coming back round: five sets on her branch now cover 44 or 45 of the 45.

Where the pool is smaller than the set, the repeats are spread evenly — a set
of ten on "add 1" uses all nine facts and repeats exactly one, in a fresh order
every time.

## Tracking and revision

Every individual fact is recorded — how often, how often wrong, how long she
typically takes. Facts that are slow or shaky quietly make up **up to a third
of later sets**, dropped into the middle where they do the least damage to
morale. **Grown-ups → Facts to watch** lists the worst offenders, so you can
see that it is `+9 crossing the ten` rather than "she's bad at adding".

**Grown-ups → Today, set by set** lists every set from today with its score,
its seconds per problem against the branch target, whether it counted as a
good set, and the points it earned. If a bonus does not appear, this says why:
a bonus needs the previous set to have been good (accurate *and* inside the
target) **on the same branch**, since a run belongs to its branch.

Also in Grown-ups: 14-day practice chart, per-branch history (sets, first-try
accuracy, best time, stars), streaks, one child or several, and the switches
for sound, motion, timer and set size.

## Badges

35 of them, from **First Steps** to **Whole Month** (30 days in a row),
**Day Done** through **Twenty Days Done**, and
**Perfect Queen** (25 perfect sets). Each locked badge shows how to get it —
they are goals, not surprises. Each level has its own badge for mastering
every branch in it.

## Juice

- **Blue dots** along the top: green means right first time, blue means right
  first time *and* inside the target — the thing mastery actually turns on.
  Gold means it took another go.
- Every key press: ripple under the finger, a wooden tick, the key pressing in.
- Right answer: the slot flips green, feathers and stars burst out, a chime
  that climbs a pentatonic run as her streak grows, and a praise word floating
  up. Every fifth in a row gets confetti and a macaw squawk.
- Finishing a set: stars land one at a time, each with its own note, then a
  fanfare and — for three stars — a full confetti drop.
- All sound is synthesised in the browser (no audio files, works offline). All
  of it can be switched off, and it respects `prefers-reduced-motion`.

## iPad specifics

Full-bleed with safe-area insets, no pinch or double-tap zoom, no text
selection or callout menus, `pointerdown` instead of `click` so keys respond
instantly, audio unlocked on the first touch (iOS requires this), portrait and
landscape layouts, and a service worker so it runs with the wifi off.

## Data

Everything lives in this browser's `localStorage` under `aranumberjungle.v1`,
keyed to the address the app is served from. Nothing is uploaded anywhere,
there are no accounts, no analytics, no network requests at all.

Two consequences worth knowing:

- **A changing address means a fresh start.** Preview links that get republished
  are the usual culprit. Host it at a permanent address (above) and this goes
  away. The app notices when it is running inside a preview and says so in
  Grown-ups.
- **Moving devices is deliberate.** Copy the backup from Grown-ups and paste it
  into the Restore box on the new device.

## Tests

```sh
node tests/selftest.mjs   # 394 checks: generators, mastery, stars, badges, storage
node tests/sync.mjs       #  48 checks: two devices, one family code, real endpoint
node tests/smoke.mjs      # 114 checks: drives the real UI in headless Chromium

SMOKE_PATH=/dist/ara-number-jungle.html node tests/smoke.mjs   # same, on the bundle
```

One rule worth stating because it was a real bug: **revision is never harder
than the branch she is on.** Each branch learns what it can produce by sampling
its own generator, and a tricky fact is only dropped back in if it fits inside
that. Going to "Add 1" for an easy win gets nothing but adding 1.

`selftest.mjs` runs each of the 46 generators 300 times and checks the
arithmetic is sound *and* that each branch only produces what its description
promises — that "sums up to 24" never exceeds 24, that Level 2A never passes
10, that Level 3A only ever adds 1, 2 or 3. `smoke.mjs` plays a whole set with
real taps, types a digit and backspaces it, gets one deliberately wrong,
checks auto-check mode, and checks both iPad orientations for overflow. Pass
`--shots <dir>` to save screenshots.

## Files

```
index.html              screens, in markup
css/app.css             all styling, one file
js/curriculum.js        the 47 branches and their generators
js/store.js             profiles, progress, per-fact history (localStorage)
js/merge.js             combining two devices' progress, losslessly
js/sync.js              the family account client (pull, push, conflict retry)
netlify/functions/      the family account endpoint (compare-and-set)
js/engine.js            building a set, timing, scoring, mastery
js/badges.js            35 badges as pure tests against the profile
js/audio.js             every sound, synthesised with WebAudio
js/juice.js             feathers, confetti, ripples, wobbles
js/ui.js                rendering each screen
js/play.js              the play loop and input handling
js/app.js               boot and event wiring
sw.js                   offline cache
tools/bundle.mjs        inlines everything into one file
tests/                  the two test scripts
```

## Changing things

- **Her level:** Grown-ups → Where she is.
- **Add a branch:** one entry in `js/curriculum.js` — id, level, name, detail,
  target seconds, and a `gen()` returning `{a, b, op, answer}`. It appears on
  the map automatically. Add an invariant for it in `tests/selftest.mjs`.
  `sumBand(lo, hi, ...)` builds a "sums up to N" branch by picking the total
  first and splitting it.
- **Retune difficulty:** the `target` on each branch is the seconds-per-problem
  she has to beat. Lower is stricter.
- **Add a badge:** one entry in `js/badges.js` with a `test(profile, setResult)`.
