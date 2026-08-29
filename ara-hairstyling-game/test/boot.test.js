/* Boot smoke: every script loads in bundle order and the game comes up with
   zero page errors. Run: node test/boot.test.js */
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
(async () => {
  const b = await chromium.launch();
  for (const target of ['index.html', 'single-file/ara-salon.html']) {
    const page = await (await b.newContext()).newPage();
    const errs = [];
    page.on('pageerror', e => errs.push(e.message));
    await page.goto('file://' + __dirname + '/../' + target);
    await page.waitForTimeout(1200);
    const up = await page.evaluate(() =>
      !!(window.Game && window.Game.state.client && window.SalonStore.store.profile().id &&
         window.SalonWords.bank.length > 100 && window.SalonBadges.list.length > 10));
    if (!up || errs.length) {
      console.error(target, 'FAILED', errs);
      process.exit(1);
    }
    console.log(target, 'boots clean');
  }
  await b.close();
})();
