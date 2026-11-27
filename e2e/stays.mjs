// Séjours et voyages sur plusieurs jours : « Arrivée Lyna », elle reste 3 jours.
import { chromium, devices } from 'playwright';
const BASE = process.env.BASE || 'http://localhost:4173/';
const results = [];
const ok = (n, c, x = '') => { results.push(!!c); console.log(`${c ? '✅' : '❌'} ${n} ${x}`); };
const errors = [];
const browser = await chromium.launch();
const ctx = await browser.newContext({ ...devices['iPhone 13'], locale: 'fr-FR', timezoneId: 'Europe/Paris' });
const page = await ctx.newPage();
page.on('pageerror', (e) => errors.push(e.message));
await page.clock.install({ time: new Date('2026-11-27T09:00:00+01:00') });

await page.goto(BASE + '#/calendar');
await page.waitForTimeout(800);
ok('Vue du mois : un encart « Voyages et séjours »', (await page.getByText('Voyages et séjours').count()) === 1);
await page.getByTestId('add-stay').click();
await page.getByTestId('task-title').fill('Arrivée Lyna');
ok('Le séjour est proposé sur plusieurs jours', await page.getByTestId('event-end').isVisible());
await page.getByTestId('multi-day').getByRole('button', { name: '3 jours' }).click();
ok('3 jours : jusqu’au dimanche 29', (await page.getByTestId('event-end').inputValue()) === '2026-11-29');
await page.locator('input[type=time]').fill('18:30');
await page.getByTestId('save-task').click();
await page.waitForTimeout(600);

const bands = async (d) => page.getByTestId(`month-day-${d}`).getByTestId('month-stay').count();
ok('Mois : une bande sur chaque jour du séjour', (await bands('2026-11-27')) === 1 && (await bands('2026-11-28')) === 1 && (await bands('2026-11-29')) === 1);
ok('Mois : rien avant ni après', (await bands('2026-11-26')) === 0 && (await bands('2026-11-30')) === 0);
const panel = await page.getByTestId('month-stays').textContent();
ok('Voyages et séjours : Lyna, 3 jours', panel.includes('Arrivée Lyna') && panel.includes('3 jours'), panel);

await page.getByTestId('month-day-2026-11-29').click();
await page.waitForTimeout(300);
const stay29 = page.locator('[data-testid=stay]').first();
ok('Dimanche 29 : « jour 3 sur 3 »', (await stay29.textContent()).includes('jour 3 sur 3'), await stay29.textContent());

// Aujourd'hui : jour 1, avec l'heure d'arrivée
await page.goto(BASE + '#/today');
await page.waitForTimeout(700);
const item = page.locator('[data-testid=task-item]:has-text("Arrivée Lyna")').first();
const t1 = await item.textContent();
ok('Accueil, 1er jour : « jour 1 sur 3 » et l’arrivée à 18:30', t1.includes('jour 1 sur 3') && t1.includes('18:30'), t1);

// Le lendemain : toujours là, sans heure, et pas de « Ça s'est passé ? »
await page.clock.setFixedTime(new Date('2026-11-28T23:00:00+01:00'));
await page.reload();
await page.waitForTimeout(700);
const t2 = await page.locator('[data-testid=task-item]:has-text("Arrivée Lyna")').first().textContent();
ok('Accueil, 2e jour : « jour 2 sur 3 », sans l’heure d’arrivée', t2.includes('jour 2 sur 3') && !t2.includes('18:30'), t2);
ok('Pas de question « a eu lieu ? » pendant le séjour', (await page.locator('[data-testid=task-item]:has-text("Arrivée Lyna") [data-testid^=outcome]').count()) === 0);

// Déplacer le séjour : tout le séjour suit
await page.locator('[data-testid=task-item]:has-text("Arrivée Lyna")').first().click();
await page.waitForTimeout(300);
await page.locator('input[aria-label=Date]').fill('2026-12-04');
await page.getByTestId('save-task').click();
await page.waitForTimeout(500);
const rec = await page.evaluate(() => new Promise((r) => { const q = indexedDB.open('life-planner'); q.onsuccess = () => { const t = q.result.transaction('tasks').objectStore('tasks').getAll(); t.onsuccess = () => r(t.result.filter((x) => x.title === 'Arrivée Lyna')); }; }));
ok('Une seule fiche pour tout le séjour', rec.length === 1);
ok('Changer le 1er jour déplace tout le séjour (4 → 6 décembre)', rec[0]?.date === '2026-12-04' && rec[0]?.endDate === '2026-12-06', JSON.stringify({ date: rec[0]?.date, end: rec[0]?.endDate }));

ok('Aucune erreur dans la page', errors.length === 0, errors.join(' | '));
await browser.close();
const pass = results.filter(Boolean).length;
console.log(`\n${pass}/${results.length}`);
process.exit(pass === results.length ? 0 : 1);
