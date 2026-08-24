/*
 * bundle.mjs — squash the app into one file.
 *
 * Two outputs, same code:
 *   dist/ara-number-jungle.html           a standalone page (AirDrop it to the
 *                                         iPad and open it from Files)
 *   dist/ara-number-jungle.artifact.html  the same, minus the document wrapper,
 *                                         for hosts that supply their own
 *
 *   node tools/bundle.mjs
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const read = (p) => readFileSync(join(root, p), 'utf8')

const html = read('index.html')

// The favicon is the parrot emoji drawn by the system font, inline as SVG.
const FAVICON =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Ctext y='.9em' font-size='90'%3E🦜%3C/text%3E%3C/svg%3E"
const dataUri = (p, mime) => `data:${mime};base64,${readFileSync(join(root, p)).toString('base64')}`

// Nothing external left in the stylesheet: the artwork is all emoji now.
const css = read('css/app.css')
if (/url\(['"]?\.\./.test(css)) throw new Error('stylesheet still references an external file')

const scripts = [...html.matchAll(/<script src="([^"]+)"><\/script>/g)].map((m) => m[1])
if (scripts.length !== 11) throw new Error(`expected 11 script tags, found ${scripts.length}`)

const markup = html
  .slice(html.indexOf('<div id="app">'), html.indexOf('<!-- Plain scripts'))
  .trimEnd()

const inlined = scripts.map((src) => `<script>\n${read(src)}\n</script>`).join('\n')

// There is no service worker to register in a single file, and no manifest.
const head = `<title>Ara's Number Jungle</title>
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover" />
<meta name="theme-color" content="#ffd479" />
<meta name="apple-mobile-web-app-capable" content="yes" />
<meta name="apple-mobile-web-app-title" content="Ara's Jungle" />
<link rel="apple-touch-icon" href="${dataUri('icons/icon-180.png', 'image/png')}" />
<link rel="icon" href="${FAVICON}" type="image/svg+xml" />
<style>\n${css}\n</style>`

const body = `${markup}\n<script>window.KM_NO_SW = true</script>\n${inlined}`

mkdirSync(join(root, 'dist'), { recursive: true })
writeFileSync(
  join(root, 'dist/ara-number-jungle.html'),
  `<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8" />\n${head}\n</head>\n<body>\n${body}\n</body>\n</html>\n`,
)
writeFileSync(join(root, 'dist/ara-number-jungle.artifact.html'), `${head}\n${body}\n`)

const kb = (p) => Math.round(readFileSync(join(root, p)).length / 1024)
console.log(`dist/ara-number-jungle.html ${kb('dist/ara-number-jungle.html')}kb`)
console.log(`dist/ara-number-jungle.artifact.html ${kb('dist/ara-number-jungle.artifact.html')}kb`)
