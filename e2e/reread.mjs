// Écrire et relire : champs qui grandissent, commentaires gardés en entier, onglet « Relire » avec recherche.
import { chromium, devices } from 'playwright';
const BASE = process.env.BASE || 'http://localhost:4173/';
const results = [];
const ok = (n, c, x = '') => { results.push(!!c); console.log(`${c ? '✅' : '❌'} ${n} ${x}`); };
const errors = [];
const browser = await chromium.launch();
const ctx = await browser.newContext({ ...devices['iPhone 13'], locale: 'fr-FR', timezoneId: 'Europe/Paris' });
const page = await ctx.newPage();
page.on('pageerror', (e) => errors.push(e.message));
await page.clock.install({ time: new Date('2026-11-28T16:30:00+01:00') });
const LONG = 'Apéro au Perchoir avec Léa.\nOn a parlé de son nouveau job, de Lisbonne en mars, et on a ri jusqu’à la fermeture.\nÀ refaire très vite.';

await page.goto(BASE + '#/journal/2026-11-27');
await page.waitForTimeout(700);
await page.getByTestId('tracker-tr-apero').click();
const box = page.getByTestId('item-comment');
const h0 = (await box.boundingBox()).height;
await box.fill(LONG);
await page.waitForTimeout(100);
const h1 = (await box.boundingBox()).height;
ok('Le commentaire grandit avec le texte', h1 > h0 * 1.8, `${Math.round(h0)} → ${Math.round(h1)} px`);
const scroll = await box.evaluate((el) => el.scrollHeight - el.clientHeight);
ok('Tout le commentaire est visible, sans défilement dans le champ', scroll <= 2, `${scroll}px cachés`);
// Fermer le panneau tout de suite, sans quitter le champ : rien ne doit se perdre
await page.getByTestId('tracker-tr-apero').click();
await page.waitForTimeout(500);
const shown = page.getByTestId('day-comment').filter({ hasText: 'Lisbonne' });
await page.screenshot({ path: 'e2e/shots/iphone-commentaire.png' });
ok('Panneau fermé aussitôt : le commentaire est gardé', (await shown.count()) === 1);
ok('Il s’affiche en entier sous les activités, retours à la ligne compris', (await shown.textContent()).includes('À refaire très vite') && (await shown.locator('.read-text').evaluate((el) => getComputedStyle(el).whiteSpace)) === 'pre-wrap');

// Le texte du jour, puis on change d'app (page cachée) aussitôt
await page.getByTestId('day-text').fill('Une journée douce. Un long message de maman.');
await page.evaluate(() => { Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true }); document.dispatchEvent(new Event('visibilitychange')); });
await page.waitForTimeout(300);
await page.evaluate(() => { Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true }); });

// Une gratitude longue dans 5 minutes
await page.goto(BASE + '#/journal/fmj');
await page.waitForTimeout(600);
const g = page.getByTestId('fmj-grateful-0');
if (await g.count()) {
  const g0 = (await g.boundingBox()).height;
  await g.fill('Le soleil d’hiver sur le canal Saint-Martin, le café chaud et le message de Yasmine qui m’a fait pleurer de rire');
  await page.waitForTimeout(100);
  ok('5 minutes : une phrase longue reste lisible (le champ s’agrandit)', (await g.boundingBox()).height > g0 * 1.5);
  await g.blur();
  await page.waitForTimeout(400);
} else ok('5 minutes : champ gratitude trouvé', false);

// Relire
await page.goto(BASE + '#/journal/read');
await page.waitForTimeout(800);
await page.screenshot({ path: 'e2e/shots/iphone-relire.png' });
ok('Onglet « Relire »', await page.getByTestId('journal-read').isVisible());
const days = page.getByTestId('read-day');
ok('Les journées écrites apparaissent, la plus récente en premier', (await days.count()) >= 2 && (await days.first().textContent()).includes('28 novembre'));
const d27 = days.filter({ hasText: '27 novembre' });
ok('Le commentaire de l’apéro est relu en entier, avec Léa', (await d27.getByTestId('read-comments').textContent()).includes('À refaire très vite'));
ok('Le texte du jour est gardé même en changeant d’app aussitôt', (await d27.textContent()).includes('Un long message de maman'));
await page.getByTestId('read-search').fill('lisbonne');
await page.waitForTimeout(400);
ok('Recherche : une seule journée avec « lisbonne »', (await days.count()) === 1 && (await page.getByTestId('read-count').textContent()).startsWith('1 journée'));
ok('Le mot trouvé est surligné', (await page.locator('[data-testid=read-day] mark').first().textContent()).toLowerCase() === 'lisbonne');
await page.getByTestId('read-search').fill('LEA perchoir');
await page.waitForTimeout(400);
ok('Recherche sans accents ni majuscules, sur plusieurs mots', (await days.count()) === 1);
await page.getByTestId('read-search').fill('zzzz');
await page.waitForTimeout(300);
ok('Aucun résultat : message clair', (await days.count()) === 0 && (await page.getByText('Aucune journée ne contient ces mots.').count()) === 1);
await page.getByTestId('read-search').fill('');
await page.waitForTimeout(300);
await days.filter({ hasText: '27 novembre' }).getByTestId('read-open').click();
await page.waitForTimeout(500);
ok('« Compléter cette journée » ouvre le bon jour', page.url().endsWith('#/journal/2026-11-27') && (await page.getByTestId('day-text').inputValue()).includes('maman'));

// Notes d'un projet : gardées même si on quitte tout de suite
await page.evaluate(() => new Promise((r) => { const q = indexedDB.open('life-planner'); q.onsuccess = () => { const tx = q.result.transaction('projects', 'readwrite'); tx.objectStore('projects').put({ id: 'p-test', title: 'Déménagement', milestones: [], status: 'active', createdAt: Date.now(), updatedAt: Date.now() }); tx.oncomplete = r; }; }));
await page.goto(BASE + '#/projects');
await page.reload();
await page.waitForTimeout(700);
const firstProject = page.locator('[data-testid=project-card]').first();
if (await firstProject.count()) {
  await firstProject.click();
  await page.waitForTimeout(500);
  await page.getByTestId('project-notes').fill('Appeler le déménageur lundi');
  await page.goto(BASE + '#/today');
  await page.waitForTimeout(300);
  await page.goBack();
  await page.waitForTimeout(600);
  ok('Notes de projet gardées en quittant aussitôt', (await page.getByTestId('project-notes').inputValue()).includes('déménageur'));
} else console.log('ℹ️ pas de projet de démo : test des notes de projet sauté');

ok('Aucune erreur dans la page', errors.length === 0, errors.join(' | '));
await browser.close();
const pass = results.filter(Boolean).length;
console.log(`\n${pass}/${results.length}`);
process.exit(pass === results.length ? 0 : 1);
