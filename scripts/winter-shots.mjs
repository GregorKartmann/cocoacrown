// Screenshots of the Advent event at iPhone size (needs `vite preview` and ?debug&advent=...).
import { chromium } from '@playwright/test';
const [base, out] = process.argv.slice(2);
const browser = await chromium.launch({ channel: 'chrome', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const errs = [];

async function open(date) {
  const ctx = await browser.newContext({ viewport: { width: 393, height: 852 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errs.push(e.message));
  await page.goto(`${base}?debug&advent=${date}`);
  await page.waitForSelector('[data-testid=money]');
  await page.waitForTimeout(900);
  return { ctx, page };
}

// 1) November preview
{
  const { ctx, page } = await open('2026-11-25');
  await page.screenshot({ path: `${out}/w1-world-nov.png` });
  await page.click('[data-testid=winter-btn]');
  await page.waitForTimeout(700);
  for (let i = 0; i < 4; i++) { await page.click('[data-testid=wf-0]'); await page.waitForTimeout(400); }
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `${out}/w2-factory-nov.png` });
  await page.click('[data-testid=wtab-calendar]');
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${out}/w3-calendar-nov.png` });
  await ctx.close();
}

// 2) 6 December: doors 1–5 collected, door 6 via the dialog
{
  const { ctx, page } = await open('2026-12-06');
  await page.evaluate(() => {
    const st = window.__cc.store;
    for (let d = 1; d <= 5; d++) { st.openDoor(d); st.claimDoor(d); }
    st.state.winter.stars += 3000;
    st.winterBuild(1);
    st.state.winter.floors[0].level = 18;
    st.state.winter.floors[1].level = 6;
    st.notify(true);
  });
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${out}/w4-world-dec6.png` });
  await page.click('[data-testid=winter-btn]');
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${out}/w5-calendar-dec6.png` });
  await page.click('[data-testid=door-6]');
  await page.waitForTimeout(900);
  await page.screenshot({ path: `${out}/w6-door6.png` });
  await page.click('[data-testid=door-claim]');
  await page.waitForTimeout(700);
  await page.screenshot({ path: `${out}/w7-door6-claimed.png` });
  await page.click('[data-testid=door-close]');
  await page.click('[data-testid=wtab-factory]');
  await page.click('[data-testid=wf-1]');
  await page.waitForTimeout(2500);
  await page.screenshot({ path: `${out}/w8-factory-dec6.png` });
  await page.click('[data-testid=wtab-market]');
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${out}/w9-market-dec6.png` });
  console.log(JSON.stringify(await page.evaluate(() => { const s = window.__cc.store.state; return { stars: s.winter.stars, claimed: s.winter.claimed, mgr: s.managers.map((m) => m.name) }; })));
  await ctx.close();
}

// 3) 24 December: everything collected, decoration in the tower
{
  const { ctx, page } = await open('2026-12-24');
  await page.evaluate(() => {
    const st = window.__cc.store;
    st.state.money = st.state.money.add(5e6);
    st.unlock(1); st.unlock(2);
    for (let d = 1; d <= 24; d++) { st.openDoor(d); st.claimDoor(d); }
    st.notify(true);
  });
  await page.waitForTimeout(1500);
  await page.evaluate(() => window.__cc.world.focus('ship'));
  await page.waitForTimeout(3000);
  await page.screenshot({ path: `${out}/w10-world-dec24-bottom.png` });
  await page.evaluate(() => { const w = window.__cc.world; w.scrollTarget = w.bounds().min; });
  await page.waitForTimeout(2000);
  await page.mouse.move(200, 400);
  await page.screenshot({ path: `${out}/w11-world-dec24-top.png` });
  await page.click('[data-testid=winter-btn]');
  await page.waitForTimeout(500);
  await page.click('[data-testid=wtab-calendar]');
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${out}/w12-calendar-dec24.png` });
  await ctx.close();
}
console.log('errors', errs);
await browser.close();
