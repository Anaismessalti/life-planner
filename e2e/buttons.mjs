// Clique chaque bouton visible de chaque page (iPhone et Mac) et vérifie qu'aucune erreur ne survient.
import { chromium, devices } from 'playwright';
const BASE = process.env.BASE || 'http://localhost:4173/';
const browser = await chromium.launch();
const errors = [];
let clicked = 0;
for (const [name, dev] of [['iphone', devices['iPhone 13']], ['mac', { viewport: { width: 1440, height: 900 } }]]) {
  const ctx = await browser.newContext({ ...dev, locale: 'fr-FR' });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(`${name} ${page.url()}: ${e.message}`));
  await page.clock.install({ time: new Date('2026-11-25T09:00:00+01:00') });
  await page.goto(BASE + '#/settings');
  await page.waitForSelector('text=Sauvegardes et export');
  await page.locator('input[type=file][accept*=json]').setInputFiles('e2e/demo-backup.json');
  await page.waitForTimeout(600);
  for (const route of ['today', 'calendar', 'projects', 'projects/p1', 'budget', 'notes', 'settings']) {
    await page.goto(BASE + '#/' + route);
    await page.waitForTimeout(300);
    const n = await page.locator('main button:visible').count();
    for (let i = 0; i < n; i++) {
      await page.goto(BASE + '#/' + route);
      await page.waitForTimeout(150);
      const b = page.locator('main button:visible').nth(i);
      const label = ((await b.getAttribute('aria-label').catch(() => '')) || (await b.textContent().catch(() => '')) || '').trim();
      if (/Supprimer toutes|Se déconnecter|Changer de configuration/.test(label)) continue;
      try {
        await b.click({ timeout: 1500 });
        clicked++;
      } catch {}
      await page.waitForTimeout(120);
      await page.keyboard.press('Escape');
    }
  }
  await ctx.close();
}
await browser.close();
console.log(`${clicked} boutons cliqués`);
console.log('Erreurs :', errors.length ? errors.slice(0, 20) : 'aucune');
