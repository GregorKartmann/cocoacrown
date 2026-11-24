// Usage: node scripts/harness/static-cors.mjs "$PWD/dist" & node scripts/harness/sandbox-host.mjs allow-scripts & node scripts/harness/boot-robustness.mjs
// Start-up under hostile conditions: sandboxed iframe, hanging IndexedDB, failing and hanging images.
import { chromium } from '@playwright/test';
const browser = await chromium.launch({ channel: 'chrome', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });

async function scenario(name, setup, url = 'http://127.0.0.1:4190/', frame = false) {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));
  await setup?.(page);
  const t0 = Date.now();
  await page.goto(url);
  const ctx = () => (frame ? page.frames()[1] : page);
  let ok = false;
  let tReady = 0;
  for (let i = 0; i < 160; i++) {
    await page.waitForTimeout(250);
    try {
      if (await ctx().locator('[data-testid=money]').count()) { ok = true; tReady = Date.now(); break; }
    } catch {}
  }
  await page.waitForTimeout(1200);
  const step = ok ? '' : await ctx().locator('[data-testid=loading-step]').textContent({ timeout: 500 }).catch(() => '');
  const toast = await ctx().evaluate(() => document.body.innerText.includes('Vorschau kann nicht gespeichert')).catch(() => null);
  console.log(`${name}: ${ok ? 'gestartet' : 'HÄNGT'} nach ${(((tReady || Date.now()) - t0) / 1000).toFixed(1)} s ${ok ? '' : '| ' + step} ${toast ? '| Hinweis: kein Speichern' : ''} ${errs.length ? '| errors: ' + errs.join(' ; ') : ''}`);
  await page.close();
}

await scenario('normal', null, 'http://127.0.0.1:4190/');
await scenario('sandbox (allow-scripts)', null, 'http://localhost:4180/', true);
await scenario('IndexedDB hängt', (p) =>
  p.addInitScript(() => {
    const fake = () => { const r = {}; return r; };
    IDBFactory.prototype.open = function () { return fake(); };
  }),
);
await scenario('ein Bild schlägt fehl', (p) => p.route(/etage_trueffel.*\.webp/, (r) => r.abort()));
await scenario('ein Bild hängt', (p) => p.route(/stadt_und_strasse.*\.webp/, () => { /* never answer */ }));
await browser.close();
