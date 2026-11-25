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

test('Marke verkaufen: Kronen, Neustart, Manager bleiben, Stand übersteht Neuladen', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await open(page);
  await page.evaluate(() => {
    const cc = (window as unknown as { __cc: { store: any; give(v: number): void } }).__cc; // eslint-disable-line @typescript-eslint/no-explicit-any
    cc.give(5e9);
    for (let f = 1; f < 5; f++) cc.store.unlock(f);
    cc.store.hire('floor', 'f3');
    cc.store.state.stats.totalEarned = cc.store.state.stats.totalEarned.add(4e8);
    cc.store.notify(true);
  });
  await page.getByTestId('crown-btn').click();
  await expect(page.getByTestId('prestige-gain')).toContainText('+6 Kronen');
  await page.waitForTimeout(400);
  await page.getByTestId('sell-brand').click();
  await page.getByTestId('sell-brand').click();
  await expect(page.getByTestId('brand-sold')).toBeVisible();
  await page.waitForTimeout(450);
  await page.getByTestId('brand-sold-ok').click();
  const st = await page.evaluate(() => {
    const s = (window as unknown as { __cc: { store: { state: any } } }).__cc.store.state; // eslint-disable-line @typescript-eslint/no-explicit-any
    return { crowns: s.prestige.crowns, floors: s.floors.filter((f: { unlocked: boolean }) => f.unlocked).length, money: s.money.toNumber(), home: s.managers[0].home };
  });
  expect(st).toEqual({ crowns: 6, floors: 1, money: 0, home: 'f3' });
  await page.evaluate(() => (window as unknown as { __cc: { store: { onHidden(): void } } }).__cc.store.onHidden());
  await page.waitForTimeout(500);
  await page.reload();
  await expect(page.getByTestId('money')).toBeVisible();
  await page.waitForFunction(() => !!(window as unknown as { __cc?: unknown }).__cc);
  const crowns = await page.evaluate(() => (window as unknown as { __cc: { store: { state: { prestige: { crowns: number } } } } }).__cc.store.state.prestige.crowns);
  expect(crowns).toBe(6);
  expect(errors).toEqual([]);
});

test('Rezeptlabor: öffnet mit der 3. Etage, Forschung starten kostet Punkte', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await open(page);
  await page.getByTestId('nav-research').click();
  await expect(page.getByTestId('research-sheet')).toHaveCount(0); // still closed: only a hint
  await page.evaluate(() => {
    const cc = (window as unknown as { __cc: { store: any; give(v: number): void } }).__cc; // eslint-disable-line @typescript-eslint/no-explicit-any
    cc.give(1e7);
    cc.store.unlock(1);
    cc.store.unlock(2);
  });
  await page.getByTestId('nav-research').click();
  await expect(page.getByTestId('research-sheet')).toBeVisible();
  await expect(page.getByTestId('research-points')).toContainText('2');
  await page.waitForTimeout(400);
  await page.getByTestId('node-schnellere_zyklen').click();
  await page.getByTestId('research-start').click();
  await expect(page.getByTestId('research-start')).toContainText('In Arbeit');
  const r = await page.evaluate(() => {
    const s = (window as unknown as { __cc: { store: { state: any } } }).__cc.store.state; // eslint-disable-line @typescript-eslint/no-explicit-any
    return { points: s.research.points, active: s.research.active?.id };
  });
  expect(r).toEqual({ points: 1, active: 'schnellere_zyklen' });
  expect(errors).toEqual([]);
});

test('Ziele: drei Tagesziele, Erfolg abholen, Goldene Bohne einlösen', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await open(page);
  await page.evaluate(() => {
    const st = (window as unknown as { __cc: { store: any } }).__cc.store; // eslint-disable-line @typescript-eslint/no-explicit-any
    st.state.stats.batches = 12;
    st.state.rewards.goldenBeans = 1;
    st.notify(true);
  });
  await page.getByTestId('nav-goals').click();
  await page.getByTestId('tab-daily').click();
  await expect(page.getByTestId('daily-0')).toBeVisible();
  await expect(page.getByTestId('daily-2')).toBeVisible();
  await page.getByTestId('tab-achievements').click();
  await page.waitForTimeout(400);
  await page.getByTestId('claim-ach-charges_10').click();
  await page.getByTestId('redeem-bean').click();
  const st = await page.evaluate(() => {
    const s = (window as unknown as { __cc: { store: { state: any } } }).__cc.store.state; // eslint-disable-line @typescript-eslint/no-explicit-any
    return { claimed: s.goals.claimed, points: s.research.points, beans: s.rewards.goldenBeans, caught: s.stats.goldenCaught, goals: s.daily.goals.length };
  });
  expect(st).toEqual({ claimed: ['charges_10'], points: 1, beans: 0, caught: 0, goals: 3 });
  expect(errors).toEqual([]);
});
