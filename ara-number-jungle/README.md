# Ara's Number Jungle 🦜

A numpad maths game for Ara, built for an iPad with no stylus. It is Kumon in
shape — a long ladder of narrow steps, ten-problem sets, and you only move up
when you are *both* accurate and quick — but it is a game to play, not a
worksheet to fill in.

Ara means macaw, so she is a scarlet macaw climbing the rainforest: Forest
Floor → Understory → Canopy → Treetops → Open Sky.

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

The default starting branch is **Level A · Add 11 — "add 11 to numbers over
24"**, which is where you said she is. Everything below it is unlocked for
confidence sets, everything above is locked until she gets there.

If that is off by a branch or two, change it in **Grown-ups → Where she is**;
the picker lists the whole ladder. Nothing else needs adjusting — targets and
mastery follow the branch she is on.

## The ladder

47 branches across five levels. Each has its own problem generator, so a
branch can only ever produce the kind of question it describes.

| Level | Place | Covers | Branches |
| --- | --- | --- | --- |
| 3A | Forest Floor | Sums up to 10, friends of 10 | 8 |
| 2A | Understory | Doubles, bridging ten, sums to 20 | 7 |
| A | The Canopy | Adding to two-digit numbers, taking away | 14 |
| B | Treetops | Carrying, borrowing, three digits | 10 |
| C | Open Sky | Times tables, 2-digit × 1-digit, sharing | 10 |

## How moving up works

- A **set** is 10 problems (5 or 20 if you prefer — a setting).
- A set is **quick** if she averages under the branch's target seconds per
  problem, and **accurate** if 9 of 10 are right first try.
- **Three quick, accurate sets in a row** masters the branch and moves her up.
  One slow or scrappy set resets the run. That is the whole bargain, and it is
  the same one a Kumon worksheet makes.
- **Stars** are per set: ⭐⭐⭐ quick and near-perfect, ⭐⭐ solid, ⭐ finished it.

Timing counts thinking time only — from a problem appearing to the right
answer, wrong goes included. The confetti between problems is not charged to
her.

## Getting it wrong

Nothing bad happens. A soft low note, a wobble, the slot clears, try again.
After two goes it shows the answer for her to copy in, and moves on. Wrong
answers cost the streak and the star rating, never the ability to continue.

## Tracking and revision

Every individual fact is recorded — how often, how often wrong, how long she
typically takes. Facts that are slow or shaky quietly make up **up to a third
of later sets**, dropped into the middle where they do the least damage to
morale. **Grown-ups → Facts to watch** lists the worst offenders, so you can
see that it is `+9 crossing the ten` rather than "she's bad at adding".

Also in Grown-ups: 14-day practice chart, per-branch history (sets, first-try
accuracy, best time, stars), streaks, one child or several, and the switches
for sound, motion, timer and set size.

## Badges

32 of them, from **First Steps** to **Whole Month** (30 days in a row) and
**Perfect Queen** (25 perfect sets). Each locked badge shows how to get it —
they are goals, not surprises. Each level has its own badge for mastering
every branch in it.

## Juice

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

Everything lives in this browser's `localStorage` under
`aranumberjungle.v1`. Nothing is uploaded anywhere, there are no accounts, no
analytics, no network requests at all. Clearing Safari's data for the site
erases her progress, so if you move devices, do it deliberately.

## Tests

```sh
node tests/selftest.mjs   # 293 checks: every generator, mastery, badges, storage
node tests/smoke.mjs      # 35 checks: drives the real UI in headless Chromium

SMOKE_PATH=/dist/ara-number-jungle.html node tests/smoke.mjs   # same, on the bundle
```

`selftest.mjs` runs each of the 47 generators 300 times and checks the
arithmetic is sound *and* that each branch only produces what its description
promises (Add 11 really is `b === 11` and `a > 24`). `smoke.mjs` plays a whole
set with real taps, gets one deliberately wrong, and checks both iPad
orientations for overflow. Pass `--shots <dir>` to save screenshots.

## Files

```
index.html              screens, in markup
css/app.css             all styling, one file
js/curriculum.js        the 47 branches and their generators
js/store.js             profiles, progress, per-fact history (localStorage)
js/engine.js            building a set, timing, scoring, mastery
js/badges.js            32 badges as pure tests against the profile
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
- **Retune difficulty:** the `target` on each branch is the seconds-per-problem
  she has to beat. Lower is stricter.
- **Add a badge:** one entry in `js/badges.js` with a `test(profile, setResult)`.
