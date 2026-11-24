import { expect, test, type Page } from '@playwright/test';

type Pos = Record<string, { x: number; y: number }>;
const positions = (page: Page) => page.evaluate(() => (window as unknown as { __cc: { positions: () => Pos } }).__cc.positions());
const money = (page: Page) => page.evaluate(() => (window as unknown as { __cc: { store: { state: { money: { toNumber(): number } } } } }).__cc.store.state.money.toNumber());

async function open(page: Page) {
  await page.goto('/?debug=1');
  await expect(page.getByTestId('money')).toBeVisible();
  await page.waitForFunction(() => !!(window as unknown as { __cc?: unknown }).__cc);
  await page.waitForTimeout(800);
}

test('erster Kreislauf: tippen, Aufzug, Verkauf ergibt Geld', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await open(page);
  let p = await positions(page);
  await page.touchscreen.tap(p.f0.x, p.f0.y);
  await page.waitForTimeout(3300);
  await expect(page.getByTestId('claim')).toBeVisible();
  p = await positions(page);
  await page.touchscreen.tap(p.lift.x, p.lift.y);
  await page.waitForTimeout(3000);
  p = await positions(page);
  await page.touchscreen.tap(p.ship.x, p.ship.y);
  await page.waitForTimeout(3500);
  expect(await money(page)).toBe(3);
  await page.getByTestId('claim').click();
  expect(await money(page)).toBe(6);
  expect(errors).toEqual([]);
});

test('Upgrade über das Stations-Menü', async ({ page }) => {
  await open(page);
  await page.evaluate(() => (window as unknown as { __cc: { give(v: number): void } }).__cc.give(100));
  const p = await positions(page);
  await page.touchscreen.tap(p.f0badge.x, p.f0badge.y);
  await expect(page.getByTestId('buy')).toBeVisible();
  await page.waitForTimeout(400);
  await page.getByTestId('buy').click();
  const lvl = await page.evaluate(() => (window as unknown as { __cc: { store: { state: { floors: { level: number }[] } } } }).__cc.store.state.floors[0].level);
  expect(lvl).toBe(2);
  expect(await money(page)).toBe(95);
});

test('Spielstand bleibt nach Neuladen erhalten und Offline-Zeit wird gutgeschrieben', async ({ page }) => {
  await open(page);
  await page.evaluate(async () => {
    const cc = (window as unknown as { __cc: { give(v: number): void; store: any } }).__cc;
    cc.give(10000);
    const st = cc.store;
    st.hire('floor', 'f0');
    st.hire('lift', 'lift');
    st.hire('ship', 'ship');
    for (let k = 0; k < 20; k++) {
      st.buy('f0', 1);
      st.buy('lift', 1);
      st.buy('ship', 1);
    }
    st.stop();
    st.state.lastWallTime -= 3600 * 1000; // pretend we were away for an hour
    st.saves.saveSync(st.state);
    await st.saves.save(st.state);
    // detach storage so the unload handler does not save the current time over it
    st.saves = null;
  });
  await page.waitForTimeout(500);
  await page.reload();
  await expect(page.getByTestId('offline-dialog')).toBeVisible();
  await page.getByTestId('collect').click();
  const lvl = await page.evaluate(() => (window as unknown as { __cc: { store: { state: { floors: { level: number }[] } } } }).__cc.store.state.floors[0].level);
  expect(lvl).toBe(21);
  // a second reload right away must not credit the hour again
  await page.reload();
  await page.waitForTimeout(1200);
  await expect(page.getByTestId('offline-dialog')).toHaveCount(0);
});

test('PWA: Manifest, Service Worker und Offline-Start', async ({ page, context }) => {
  await page.goto('/');
  const manifest = await page.evaluate(async () => {
    const href = document.querySelector('link[rel=manifest]')?.getAttribute('href');
    if (!href) return null;
    return (await fetch(href)).json();
  });
  expect(manifest?.display).toBe('standalone');
  expect(manifest?.icons?.length).toBeGreaterThanOrEqual(3);
  await page.waitForFunction(async () => !!(await navigator.serviceWorker.getRegistration())?.active, null, { timeout: 20000 });
  await page.reload();
  await page.waitForTimeout(1500);
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByTestId('money')).toBeVisible({ timeout: 15000 });
  await context.setOffline(false);
});
