// Screenshots of the Ziele sheet (daily, achievements) at iPhone size (needs `vite preview` and ?debug).
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
  const cc = window.__cc; const st = cc.store; const s = st.state;
  cc.give(1e7); st.unlock(1); st.unlock(2);
  st.hire('floor', 'f0');
  s.stats.batches = 320; s.stats.vanTrips = 64; s.stats.liftTrips = 130; s.stats.goldenCaught = 3; s.stats.offlineSeconds = 5400;
  s.daily.streak = 2; s.daily.lastCompleteDay = (() => { const d = new Date(Date.now() - 86400000); return d.toISOString().slice(0, 10); })();
  s.rewards.goldenBeans = 1; s.rewards.freeHires = 1;
  s.quest.index = 26;
  st.notify(true);
});
for (let i = 0; i < 12; i++) { await page.evaluate(() => window.__cc.store.tap('f1')); await page.waitForTimeout(60); }
await page.waitForTimeout(2500);
await page.screenshot({ path: `${out}/g0-world.png` });
await page.click('[data-testid=nav-goals]');
await page.waitForTimeout(900);
await page.screenshot({ path: `${out}/g1-daily.png` });
await page.click('[data-testid=tab-achievements]');
await page.waitForTimeout(600);
await page.screenshot({ path: `${out}/g2-ach.png` });
await page.locator('[data-testid=claim-ach-charges_10]').click();
await page.waitForTimeout(500);
await page.evaluate(() => document.querySelector('.sheet-body')?.scrollTo(0, 900));
await page.waitForTimeout(400);
await page.screenshot({ path: `${out}/g3-ach-scrolled.png` });
console.log(JSON.stringify(await page.evaluate(() => { const s = window.__cc.store.state; return { daily: s.daily.goals, claimed: s.goals.claimed, pts: s.research.points }; })), errs);
await browser.close();
