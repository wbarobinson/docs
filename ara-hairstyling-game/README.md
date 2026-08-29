# Ara's Hair Salon 💇‍♀️

A hairstyling game built for Ara, to be played with fingers on an iPad.

Clients come in, each one asks for a look — and the ask arrives as **words**
("cherry hair · braid · butterfly"). Reading the wish and finding the matching
emoji in the trays IS the game: every tray chip and dye swatch carries its
word, tapping a wish speaks it aloud, and the emoji only reveals itself as a
hint after a good think (sooner for brand-new words, never for words she owns).
Between clients, the **Word Party** shows one word and four pictures.

Stars are the one currency and the rule is speakable: 3 for finishing, 4 for
granting a wish, 5 for granting them all; matched words earn 1 each. Stars
open accessory packs (Garden, Animals, Ocean, Sweets, Sky, Treasure), climb
ranks (Little Helper → Sparkle Legend), and light 18 badges. Packs only ever
ADD things — every tool works from minute one, there is no way to lose, and
🚿 washes it all out to start again.

## Getting it onto the iPad

Pick whichever is easiest — all three are the same game.

**1. The link (easiest).** Open the Artifact link Claude sent, then tap Share →
*Add to Home Screen* so it opens fullscreen with no browser bars.

**2. One file, no internet.** Send `single-file/ara-salon.html` to the iPad (AirDrop,
email, or drop it in iCloud Drive). Tap it in the Files app and it opens in
Safari. The whole game is that one file, so it works on a plane.

**3. Serve the folder.** Any static host works — GitHub Pages, or locally:

```sh
npx http-server .      # then open the printed address on the iPad
```

Served over http(s) it also registers a service worker, so after the first
visit it keeps working offline.

## What the salon remembers

Persistence uses the same architecture as Ara's Number Jungle:

- **Two stylists** — Ara 🦜 and Jon 🦖 share the iPad; everything hangs off a
  profile, switched from the top bar.
- **Nothing is lost to a closed tab** — the half-done makeover (hair, dye,
  bows, even a placed photo) snapshots continuously and is restored on the
  next open; finished work lives in an append-only log with a rolling backup
  copy of the whole state.
- **Family code** — grown-ups (long-press 🔒 in the profile card) can make a
  code; typing it on another device merges both salons. Merges only ever go
  up: a star earned anywhere is earned everywhere, badges are forever.
- **Paste-anywhere backup** — the same panel exports the whole record as text.
- **Word records** — every word she reads is tracked (seen / matched /
  hinted), which drives which words the wishes and the Word Party choose next.

## Styling a real photo

Tap 🔔 → **📷 Style a real photo**. On the iPad that offers the camera or the
photo library, so Ara can style a photo of herself, of you, or of a doll. Line
the face up inside the circle (drag to move, − and + to size), tap Done, and
the hair is rendered around a real face.

The photo never leaves the iPad. It is not uploaded, and the saved photos in
the sticker book live in the browser's own storage on the device.

Tap 🔔 → **Back to drawn friends** to go back to Poppy and the others.

## The tools

| Tool | What it does |
| --- | --- |
| 💆 Brush | Drag through the hair to move it, smooth it and make it shiny |
| 🌱 Grow | The inverse of scissors: paint the tips and the hair grows back |
| ✂️ Cut | Drag across the hair to trim it to that length |
| 🎨 Colour | Pick a colour and paint it on — paint only the ends for an ombré |
| 🌀 Curl | Drag over the hair to curl it, a bit more on every pass |
| 💧 Straight | The opposite of curl |
| 💨 Dryer | Blows the hair around and gives it volume |
| ✨ Sparkle | Sticks glitter to the strand you touch |
| 🎀 Bows | Tap the hair to clip something on. It stays put as the hair moves |
| 💇 Styles | Ponytail, high pony, pigtails, bun, braid, half up |

Ponytails, high ponies, braids and half-ups are gathered and sent *behind* her
head, the way they really sit, so they never hang over her face. 🪞 in the top
bar is a hand mirror showing the back of her head, which is how you see them.
Tap it again to put the mirror away.

Two fingers work at once for brushing and curling.

🪞 shows the back of her hair. 📔 keeps the last eight photos on the iPad itself. 🔔 brings in a new client.
↩️ undoes the last thing.

## How it works

**Simulation.** About 88 guide strands, each a chain of points run through a
Verlet solver with distance constraints, bending stiffness, collision against
the head, and a curved shoulder line the hair drapes over. Styles (ponytail, bun…)
pull the strands toward a gather point and a generated tail path; the gathered
ones are drawn in the layer behind the head, and the mirror re-renders the same
strands over the head instead of around it, cached and refreshed every third
frame. Colour is
stored per segment, which is why painting the ends works.

**Rendering.** Each guide stands for a clump and is drawn as a fan of thin
child hairs with their own tone, so the density comes from rendering rather
than from simulating every hair. Each clump is lit by a single key light: a
diffuse term from the scalp normal, an ambient-occlusion darkening at the
roots, and the Kajiya-Kay anisotropic highlight, which is what puts the band
of shine around the crown and is most of the reason hair reads as hair. The
number of child hairs per clump is chosen at runtime from measured draw time
and frame pacing, so a slower iPad renders fewer rather than stuttering.

Everything is drawn to one canvas in a fixed 1000x750 space that is scaled to
whatever screen it lands on, so landscape and portrait both work.

```
index.html              the page
style.css               the buttons and trays
js/hair.js              strand physics, tools, styles
js/render.js            hair shading: clumps, lighting, specular
js/store.js             profiles, log, streaks, session snapshot, gallery
js/merge.js             progress-only-up merge of two copies
js/sync.js              family-code sync (compare-and-set, local-first)
js/words.js             generated content: word bank, packs, badges, ranks
js/party.js             the Word Party matching game
js/badges.js            badge engine (pure predicates)
js/clients.js           clients, colours, accessories, the wish list
js/audio.js             synthesised sound effects (no audio files)
js/game.js              drawing, touch handling, photos, UI
build.js                bundles it all into single-file/
```

No dependencies, no build step needed to run it — `build.js` only exists to
produce the single-file copy.

```sh
node build.js
```

## Feedback

`FEEDBACK.md` is the list Ara is filling in. That is the roadmap.

Tests: `node test/store.test.js` (persistence and merge) and
`node test/boot.test.js` (both bundles boot clean).
