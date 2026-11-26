// Screenshots of floors 9 and 10 at iPhone size (needs `vite preview` and ?debug).
import { chromium } from '@playwright/test';
const [url, out] = process.argv.slice(2);
const browser = await chromium.launch({ channel: 'chrome', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const ctx = await browser.newContext({ viewport: { width: 393, height: 852 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
const page = await ctx.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push(e.message));
await page.goto(url);
await page.waitForSelector('[data-testid=money]');
await page.waitForTimeout(800);
await page.evaluate(() => {
  const cc = window.__cc;
  const st = cc.store;
  cc.give(1e20);
  st.state.prestige.crowns = 600;
  st.state.prestige.runs = 9;
  for (let f = 1; f < 8; f++) st.unlock(f);
  for (const id of ['f0', 'f1', 'f2', 'f3', 'f4', 'f5', 'f6', 'f7', 'lift', 'ship']) {
    st.hire(id === 'lift' ? 'lift' : id === 'ship' ? 'ship' : 'floor', id);
    for (let k = 0; k < 4; k++) st.buy(id, 25);
  }
  st.notify(true);
});
await page.waitForTimeout(800);
// floor 9 still sealed: construction view and unlock sheet with the crown gate
await page.evaluate(() => window.__cc.focus('f7'));
await page.waitForTimeout(1500);
await page.screenshot({ path: `${out}/n0-gate.png` });
const pos = await page.evaluate(() => window.__cc.positions());
if (pos.construction) {
  await page.touchscreen.tap(pos.construction.x, pos.construction.y);
  await page.waitForTimeout(900);
  await page.screenshot({ path: `${out}/n1-unlock-sealed.png` });
  await page.keyboard.press('Escape');
  await page.waitForTimeout(400);
}
// enough crowns: build floors 9 and 10
await page.evaluate(() => {
  const cc = window.__cc;
  const st = cc.store;
  st.state.prestige.crowns = 2100;
  cc.give(1e21);
  st.unlock(8);
  st.unlock(9);
  for (const id of ['f8', 'f9']) {
    st.hire('floor', id);
    for (let k = 0; k < 4; k++) st.buy(id, 25);
  }
  st.notify(true);
});
await page.waitForTimeout(1500);
await page.evaluate(() => window.__cc.focus('f8'));
await page.waitForTimeout(2600);
await page.screenshot({ path: `${out}/n2-floor9.png` });
await page.waitForTimeout(700);
await page.screenshot({ path: `${out}/n2b-floor9.png` });
await page.evaluate(() => window.__cc.focus('f9'));
await page.waitForTimeout(2600);
await page.screenshot({ path: `${out}/n3-floor10-roof.png` });
await page.waitForTimeout(600);
await page.screenshot({ path: `${out}/n3b-floor10-roof.png` });
console.log(JSON.stringify(await page.evaluate(() => {
  const s = window.__cc.store.state;
  return { floors: s.floors.filter((f) => f.unlocked).length, crowns: s.prestige.crowns };
})), errs);
await browser.close();
