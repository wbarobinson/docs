# Ara's Hair Salon 💇‍♀️

A hairstyling game built for Ara, to be played with fingers on an iPad.

Clients come in, each one asks for a look ("bubblegum hair, curly, a 🎀"), and
Ara styles them: brush, cut, colour, curl, straighten, blow-dry, add sparkles
and bows, then tap **Done!** for a photo with stars.

There is no way to lose and no way to get stuck. Every haircut gets at least
three stars, nothing is locked, and 🚿 washes it all out to start again.

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

## The tools

| Tool | What it does |
| --- | --- |
| 💆 Brush | Drag through the hair to move it, smooth it and make it shiny |
| ✂️ Cut | Drag across the hair to trim it to that length |
| 🎨 Colour | Pick a colour and paint it on — paint only the ends for an ombré |
| 🌀 Curl | Drag over the hair to curl it, a bit more on every pass |
| 💧 Straight | The opposite of curl |
| 💨 Dryer | Blows the hair around and gives it volume |
| ✨ Sparkle | Sticks glitter to the strand you touch |
| 🎀 Bows | Tap the hair to clip something on. It stays put as the hair moves |
| 💇 Styles | Ponytail, high pony, pigtails, bun, braid, half up |

Two fingers work at once for brushing and curling.

📔 keeps the last eight photos on the iPad itself. 🔔 brings in a new client.
↩️ undoes the last thing.

## How it works

The hair is about 116 strands, each a chain of points run through a Verlet
solver with distance constraints, bending stiffness, collision against the
head, and a curved shoulder line the hair drapes over. Styles (ponytail, bun…)
pull the strands toward a gather point and a generated tail path. Colour is
stored per segment, which is why painting the ends works.

Everything is drawn to one canvas in a fixed 1000x750 space that is scaled to
whatever screen it lands on, so landscape and portrait both work.

```
index.html              the page
style.css               the buttons and trays
js/hair.js              strand physics, tools, styles
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
