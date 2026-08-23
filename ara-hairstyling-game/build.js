/* Bundles the salon into one file, so it can be handed around without a web server.
   Run: node build.js
     single-file/ara-salon.html  - open straight off the iPad's Files app, works offline
     single-file/artifact.html   - body-only fragment for publishing as a Claude Artifact */
const fs = require('fs');
const path = require('path');

const root = __dirname;
const read = f => fs.readFileSync(path.join(root, f), 'utf8');

const JS = ['js/hair.js', 'js/render.js', 'js/clients.js', 'js/audio.js', 'js/game.js'];
const css = read('style.css');
const js = JS.map(read).join('\n');
const html = read('index.html');

const body = html
  .slice(html.indexOf('<canvas id="salon">'), html.indexOf('<script src='))
  .trim();

const head = `<title>Ara's Hair Salon</title>
<style>
${css}
</style>`;

const main = `${body}

<script>
${js}
window.Game.start();
</script>`;

const page = head + '\n\n' + main;

const standalone = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<meta name="apple-mobile-web-app-title" content="Ara's Salon">
<meta name="theme-color" content="#ffd9ec">
${head}
</head>
<body>
${main}
</body>
</html>`;

fs.mkdirSync(path.join(root, 'single-file'), { recursive: true });
fs.writeFileSync(path.join(root, 'single-file/ara-salon.html'), standalone);
fs.writeFileSync(path.join(root, 'single-file/artifact.html'), page);
console.log('built single-file/ara-salon.html and single-file/artifact.html');
