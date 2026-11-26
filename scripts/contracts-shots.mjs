// Screenshots of Lieferverträge and Kronen-Schatzkammer at iPhone size (needs `vite preview`).
import { chromium } from '@playwright/test';
const [base, out] = process.argv.slice(2);
const browser = await chromium.launch({ channel: 'chrome', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const errs = [];
const ctx = await browser.newContext({ viewport: { width: 393, height: 852 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
const page = await ctx.newPage();
page.on('pageerror', (e) => errs.push(e.message));
await page.goto(`${base}?debug=1`);
await page.waitForSelector('[data-testid=money]');
await page.waitForTimeout(800);

// mid game: three floors, automated, board open
await page.evaluate(() => {
  const st = window.__cc.store;
  window.__cc.give(5e6);
  st.unlock(1); st.unlock(2);
  const s = st.state;
  s.floors[0].level = 40; s.floors[1].level = 25; s.floors[2].level = 12; s.lift.level = 40; s.ship.level = 40;
  st.refreshContracts();
  st.notify(true);
});
await page.waitForTimeout(1500);
await page.click('[data-testid=nav-contracts]');
await page.waitForTimeout(600);
await page.screenshot({ path: `${out}/c1-board.png` });
await page.click('[data-testid=accept-0]');
await page.waitForTimeout(600);
await page.screenshot({ path: `${out}/c2-active.png` });
await page.click('.sheet .close, [aria-label="Schließen"]').catch(() => {});
await page.keyboard.press('Escape').catch(() => {});
await page.evaluate(() => window.__cc.store.notify(true));
await page.waitForTimeout(800);
await page.screenshot({ path: `${out}/c3-strip.png` });
// deliver it
await page.evaluate(() => {
  const st = window.__cc.store;
  const a = st.state.contracts.active;
  a.progress = a.target; a.status = 'delivered';
  st.emit({ type: 'contractDelivered', customer: a.customer });
  st.notify(true);
});
await page.waitForTimeout(900);
await page.screenshot({ path: `${out}/c4-delivered.png` });
await page.click('[data-testid=contract-strip]');
await page.waitForTimeout(500);
await page.click('[data-testid=contract-claim]');
await page.waitForTimeout(800);
await page.screenshot({ path: `${out}/c5-claimed.png` });
// customers later
await page.evaluate(() => { const st = window.__cc.store; st.state.contracts.ruf = 75; st.notify(true); });
await page.waitForTimeout(400);
await page.evaluate(() => document.querySelector('.sheet-body')?.scrollTo(0, 99999));
await page.waitForTimeout(400);
await page.screenshot({ path: `${out}/c6-customers.png` });

// treasury
await page.evaluate(() => {
  const st = window.__cc.store;
  const s = st.state;
  window.__cc.give(1e9);
  st.unlock(3); st.unlock(4);
  s.prestige.crowns = 46; s.prestige.runs = 2; s.prestige.spent = 10;
  s.prestige.treasury = { startkapital: 1, startetagen: 1, startaufzug: 1 };
  st.notify(true);
});
await page.goto(`${base}?debug=1`);
await page.waitForSelector('[data-testid=money]');
await page.waitForTimeout(800);
await page.click('[data-testid=crown-btn]');
await page.waitForTimeout(500);
await page.screenshot({ path: `${out}/c7-sale.png` });
await page.click('[data-testid=ptab-treasury]');
await page.waitForTimeout(800);
await page.screenshot({ path: `${out}/c8-treasury.png` });
await page.click('[data-testid=buy-startlager]');
await page.waitForTimeout(600);
await page.screenshot({ path: `${out}/c9-treasury-bought.png` });
console.log('errors', errs);
await browser.close();
