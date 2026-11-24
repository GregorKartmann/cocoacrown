// Dev helper: offline report, golden bean, settings sheet, overview.
import { chromium } from '@playwright/test';
const url = process.argv[2] ?? 'http://localhost:4173/?debug=1';
const out = process.argv[3] ?? '/tmp/shots';
const browser = await chromium.launch({ channel: 'chrome', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
const page = await ctx.newPage();
const logs = [];
page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));
await page.goto(url);
await page.waitForTimeout(1500);
await page.evaluate(() => {
  const cc = window.__cc; const st = cc.store;
  cc.give(50000);
  st.unlock(1);
  st.hire('floor', 'f0'); st.hire('floor', 'f1'); st.hire('lift', 'lift'); st.hire('ship', 'ship');
  for (let k = 0; k < 30; k++) { st.buy('f0', 1); st.buy('lift', 1); st.buy('ship', 1); }
  for (let k = 0; k < 12; k++) st.buy('f1', 1);
  st.state.lastWallTime -= 2 * 3600 * 1000;
  st.handleAbsence();
});
await page.waitForTimeout(900);
await page.screenshot({ path: `${out}/x1-offline.png` });
await page.click('[data-testid=collect]');
await page.waitForTimeout(400);
await page.evaluate(() => { const st = window.__cc.store; st.state.golden.nextIn = 0.05; });
await page.waitForTimeout(3500);
await page.screenshot({ path: `${out}/x2-golden.png` });
const g = await page.evaluate(() => window.__cc.positions().golden);
if (g) { await page.touchscreen.tap(g.x, g.y); }
await page.waitForTimeout(500);
await page.screenshot({ path: `${out}/x3-golden-caught.png` });
await page.click('[data-testid=nav-overview]');
await page.waitForTimeout(700);
await page.screenshot({ path: `${out}/x4-overview.png` });
await page.keyboard.press('Escape');
await page.waitForTimeout(300);
await page.click('button[aria-label=Einstellungen]');
await page.waitForTimeout(700);
await page.screenshot({ path: `${out}/x5-settings.png` });
console.log(logs.join('\n'));
await browser.close();
