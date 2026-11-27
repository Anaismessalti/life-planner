// Souvenirs et rituel du soir : moment fort, photo du jour, « Ce jour-là », fermeture de la journée.
import { chromium, devices } from 'playwright';
const BASE = process.env.BASE || 'http://localhost:4173/';
const results = [];
const ok = (n, c, x = '') => { results.push(!!c); console.log(`${c ? '✅' : '❌'} ${n} ${x}`); };
const errors = [];
const browser = await chromium.launch();
const ctx = await browser.newContext({ ...devices['iPhone 13'], locale: 'fr-FR', timezoneId: 'Europe/Paris' });
const page = await ctx.newPage();
page.on('pageerror', (e) => errors.push(e.message));
await page.clock.install({ time: new Date('2026-11-27T21:10:00+01:00') });

// Une grande photo (2400 × 1600) fabriquée sur place
await page.goto(BASE + '#/today');
const big = await page.evaluate(async () => {
  const c = document.createElement('canvas'); c.width = 2400; c.height = 1600;
  const g = c.getContext('2d');
  for (let i = 0; i < 400; i++) { g.fillStyle = `hsl(${(i * 37) % 360} 70% ${30 + (i % 40)}%)`; g.fillRect((i * 97) % 2400, (i * 53) % 1600, 180, 140); }
  return c.toDataURL('image/png');
});
const buffer = Buffer.from(big.split(',')[1], 'base64');

// Il y a une semaine : moment fort, titre et photo
await page.goto(BASE + '#/journal/2026-11-20');
await page.waitForTimeout(600);
await page.getByTestId('day-highlight').fill('Fou rire avec Léa au Perchoir');
await page.getByTestId('day-title-input').fill('Le jour du Perchoir');
await page.getByTestId('photo-input').setInputFiles({ name: 'perchoir.png', mimeType: 'image/png', buffer });
await page.getByTestId('photo-preview').waitFor({ timeout: 8000 });
const size = await page.evaluate(() => new Promise((r) => { const q = indexedDB.open('life-planner'); q.onsuccess = () => { const t = q.result.transaction('photos').objectStore('photos').get('2026-11-20'); t.onsuccess = () => r(t.result ? Math.round((t.result.data.length * 3) / 4 / 1024) : -1); }; }));
ok('Photo du jour compressée sur l’appareil (moins de 180 Ko)', size > 0 && size <= 180, `${size} Ko pour une photo de ${Math.round(buffer.length / 1024)} Ko`);
await page.locator('button[aria-label="Jour suivant"]').click(); // change de jour tout de suite : rien ne doit se perdre
await page.waitForTimeout(700);

// Une tâche pour ce soir
await page.goto(BASE + '#/today');
await page.locator('[data-testid=fab], [data-testid=fab-desktop]').locator('visible=true').first().click();
await page.getByTestId('quick-input').fill('Répondre à Inès');
await page.keyboard.press('Enter');
await page.waitForTimeout(400);

await page.goto(BASE + '#/today');
await page.waitForTimeout(600);
// Mes 3 essentiels
await page.getByTestId('essentials-pick').click();
await page.getByTestId('essential-option').filter({ hasText: 'Répondre à Inès' }).click();
await page.getByTestId('essentials-save').click();
await page.waitForTimeout(400);
ok('Essentiels : la tâche choisie est en haut', (await page.getByTestId('essentials').textContent()).includes('Répondre à Inès'));
ok('Essentiels : pas de doublon dans « Ma journée »', (await page.locator('[data-testid=day-agenda] [data-testid=task-item]:has-text("Répondre à Inès")').count()) === 0);
const mem = page.getByTestId('memory-week');
ok('Ce jour-là : la journée d’il y a une semaine revient sur l’accueil', (await mem.textContent()).includes('Le jour du Perchoir') && (await mem.textContent()).includes('Fou rire avec Léa'));
ok('Ce jour-là : avec sa photo', (await mem.locator('img').count()) === 1);

// Rituel du soir
await page.getByTestId('evening-ritual-open').click();
await page.getByTestId('evening-ritual').getByTestId('mood-4').click();
await page.getByTestId('ritual-next').click();
await page.getByTestId('evening-ritual').getByTestId('day-highlight').fill('Dîner surprise chez Yasmine');
await page.getByTestId('ritual-next').click();
ok('Rituel : la tâche restante est proposée', (await page.getByTestId('ritual-task').count()) === 1);
await page.getByTestId('ritual-tomorrow').click();
await page.waitForTimeout(400);
ok('Rituel : un geste la passe à demain', await page.getByTestId('ritual-clear').count());
await page.getByTestId('ritual-next').click();
await page.getByTestId('ritual-first').fill('Envoyer le dossier');
await page.getByTestId('ritual-next').click();
await page.waitForTimeout(600);
ok('Rituel : journée fermée, moment fort affiché', (await page.getByTestId('evening-closed').textContent()).includes('Dîner surprise'));
const db = await page.evaluate(() => new Promise((r) => { const q = indexedDB.open('life-planner'); q.onsuccess = () => { const tx = q.result.transaction(['tasks', 'daylogs']); const a = tx.objectStore('tasks').getAll(); const b = tx.objectStore('daylogs').get('2026-11-27'); tx.oncomplete = () => r({ tasks: a.result.map((t) => ({ title: t.title, date: t.date, priority: t.priority })), log: b.result }); }; }));
ok('Rituel : « Répondre à Inès » passée au 28', db.tasks.some((t) => t.title === 'Répondre à Inès' && t.date === '2026-11-28'));
ok('Rituel : premier essentiel de demain créé en « absolument »', db.tasks.some((t) => t.title === 'Envoyer le dossier' && t.date === '2026-11-28' && t.priority === 'must'));
ok('Rituel : humeur et moment fort gardés', db.log?.mood === 4 && db.log?.highlight === 'Dîner surprise chez Yasmine' && !!db.log?.closedAt);
ok('Pas de défilement horizontal', await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth));
await page.screenshot({ path: 'e2e/shots/iphone-today-memories.png', fullPage: true });

// Revue du dimanche (29 novembre, 11 h)
await page.clock.setSystemTime(new Date('2026-11-29T11:00:00+01:00'));
await page.goto(BASE + '#/today');
await page.reload();
await page.waitForTimeout(800);
await page.getByTestId('weekly-review-open').click();
ok('Revue : les moments forts de la semaine', (await page.getByTestId('review-moments').textContent()).includes('Dîner surprise chez Yasmine'));
await page.getByTestId('review-win').fill('J’ai osé demander une augmentation');
await page.getByTestId('review-next').click();
await page.getByTestId('review-next').click();
await page.getByTestId('review-next').click();
await page.getByTestId('review-focus').fill('Dormir avant minuit');
await page.getByTestId('review-next').click();
await page.waitForTimeout(500);
ok('Revue : le cap de la semaine s’affiche sur l’accueil', (await page.getByTestId('week-focus').textContent()).includes('Dormir avant minuit'));
ok('Revue : la carte disparaît une fois la revue faite', (await page.getByTestId('weekly-review-open').count()) === 0);

// Bilan du mois en souvenirs
await page.goto(BASE + '#/journal/stats');
await page.waitForTimeout(900);
const pm = await page.getByTestId('period-memories').textContent();
ok('Bilan : mes plus beaux moments en tête, avec la photo', pm.includes('Le jour du Perchoir') && pm.includes('Dîner surprise') && (await page.getByTestId('period-memories').locator('img').count()) === 1);
ok('Wrapped : la carte « plus beau moment » apparaît', (await page.getByTestId('wrapped').textContent()).includes('ton plus beau moment'));
await page.screenshot({ path: 'e2e/shots/iphone-stats-memories.png', fullPage: true });
await browser.close();
console.log(`\n${results.filter(Boolean).length}/${results.length} vérifications réussies`);
console.log('Erreurs JS :', errors.length ? errors : 'aucune');
process.exit(results.every(Boolean) && !errors.length ? 0 : 1);
