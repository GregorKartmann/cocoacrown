// Screenshots of floors 6–8 and the Rezeptlabor at iPhone size (needs `vite preview` and ?debug).
import { chromium } from '@playwright/test';
const [url, out] = process.argv.slice(2);
const browser = await chromium.launch({ channel: 'chrome', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const ctx = await browser.newContext({ viewport: { width: 393, height: 852 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
const page = await ctx.newPage();
const errs = []; page.on('pageerror', (e) => errs.push(e.message));
await page.goto(url);
await page.waitForSelector('[data-testid=money]');
await page.waitForTimeout(800);
await page.evaluate(() => {
  const cc = window.__cc; const st = cc.store;
  cc.give(1e13);
  for (let f = 1; f < 5; f++) st.unlock(f);
  for (const id of ['f0','f1','f2','f3','f4','lift','ship']) { st.hire(id === 'lift' ? 'lift' : id === 'ship' ? 'ship' : 'floor', id); for (let k = 0; k < 4; k++) st.buy(id, 25); }
  cc.give(5e12);
  st.state.research.points = 23;
  st.state.research.ranks.schnellere_zyklen = 3;
  st.state.research.ranks.waermefuehrung = 1;
  st.state.research.ranks.verkaufsstellen = 5;
  st.state.research.ranks.lieferflotte = 1;
  st.notify(true);
});
await page.waitForTimeout(600);
// unlock sheet for floor 6 via debug positions
await page.evaluate(() => window.__cc.focus('f4'));
await page.waitForTimeout(1200);
await page.screenshot({ path: `${out}/e0-before-f6.png` });
await page.evaluate(() => window.__cc.focus('f4'));
await page.waitForTimeout(600);
const pos = await page.evaluate(() => window.__cc.positions());
if (pos.construction) { await page.touchscreen.tap(pos.construction.x, pos.construction.y); await page.waitForTimeout(900); await page.screenshot({ path: `${out}/e0b-unlock-sheet.png` }); await page.keyboard.press('Escape'); await page.waitForTimeout(400); }
await page.evaluate(() => { const cc = window.__cc; const st = cc.store; cc.give(1e17); st.unlock(5); st.unlock(6); st.unlock(7); for (const id of ['f5','f6','f7']) { st.hire('floor', id); for (let k = 0; k < 4; k++) st.buy(id, 25); } });
await page.waitForTimeout(1500);
await page.evaluate(() => window.__cc.focus('f6'));
await page.waitForTimeout(2500);
await page.screenshot({ path: `${out}/e1-floors67.png` });
await page.evaluate(() => window.__cc.focus('f7'));
await page.waitForTimeout(2500);
await page.screenshot({ path: `${out}/e2-floor8-roof.png` });
await page.click('[data-testid=nav-research]');
await page.waitForTimeout(1000);
await page.screenshot({ path: `${out}/e3-lab.png` });
await page.click('[data-testid=node-verkaufsstellen]');
await page.waitForTimeout(300);
await page.click('[data-testid=node-markensiegel]');
await page.waitForTimeout(300);
await page.click('[data-testid=research-start]');
await page.waitForTimeout(800);
await page.screenshot({ path: `${out}/e4-lab-active.png` });
await page.evaluate(() => document.querySelector('.sheet-body')?.scrollTo(0, 9999));
await page.waitForTimeout(300);
await page.screenshot({ path: `${out}/e5-lab-bottom.png` });
console.log(JSON.stringify(await page.evaluate(() => { const s = window.__cc.store.state; return { pts: s.research.points, active: s.research.active, floors: s.floors.filter((f) => f.unlocked).length }; })), errs);
await browser.close();
