import { chromium, devices } from 'playwright';
const b = await chromium.launch();
for (const [n, d] of [['se', devices['iPhone SE']], ['13', devices['iPhone 13']]]) {
  const c = await b.newContext({ ...d, locale: 'fr-FR' });
  const p = await c.newPage();
  await p.clock.install({ time: new Date('2026-11-26T01:30:00+01:00') });
  await p.goto('http://localhost:4173/');
  await p.waitForSelector('text=Au programme');
  const box = await p.getByTestId('fab').boundingBox();
  const vw = p.viewportSize().width;
  console.log(n, 'centre du bouton', box.x + box.width / 2, 'centre écran', vw / 2);
  await p.getByTestId('fab').click();
  await p.getByTestId('quick-input').fill('Entretien avec Christian demain 10h');
  await p.screenshot({ path: `/home/user/life-planner/e2e/shots/bar-${n}.png` });
  await p.keyboard.press('Enter');
  await p.waitForTimeout(300);
  await p.locator('nav button:visible', { hasText: 'Calendrier' }).click();
  await p.getByTestId('month-day-2026-11-27').click();
  console.log('rdv vendredi:', await p.locator('[data-testid=task-item]:has-text("Entretien avec Christian") >> text=10:00').count());
  await c.close();
}
await b.close();
