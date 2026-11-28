// Audit des quatre experts : formulaires de budget pré-remplis, annulations, restauration confirmée, saisie rapide, séjour au journal.
import { chromium, devices } from 'playwright';
const BASE = process.env.BASE || 'http://localhost:4173/';
const results = [];
const ok = (n, c, x = '') => { results.push(!!c); console.log(`${c ? '✅' : '❌'} ${n} ${x}`); };
const errors = [];
const browser = await chromium.launch();
const ctx = await browser.newContext({ ...devices['iPhone 13'], locale: 'fr-FR', timezoneId: 'Europe/Paris' });
const page = await ctx.newPage();
page.on('pageerror', (e) => errors.push(e.message));
await page.clock.install({ time: new Date('2026-11-28T10:00:00+01:00') });
await page.goto(BASE + '#/today');
await page.waitForTimeout(800);
const idb = (store) => page.evaluate((store) => new Promise((r) => { const q = indexedDB.open('life-planner'); q.onsuccess = () => { const t = q.result.transaction(store).objectStore(store).getAll(); t.onsuccess = () => r(t.result); }; }), store);
const put = (store, rec) => page.evaluate(([store, rec]) => new Promise((r) => { const q = indexedDB.open('life-planner'); q.onsuccess = () => { const tx = q.result.transaction(store, 'readwrite'); tx.objectStore(store).put(rec); tx.oncomplete = r; }; }), [store, rec]);

// 1. Un revenu existant s'ouvre pré-rempli (même ouvert juste après le chargement)
await put('incomes', { id: 'inc-sal', label: 'Salaire', type: 'salaire', amount: 2100, date: '2026-10-27', frequency: 'monthly', createdAt: 1, updatedAt: 1 });
await page.goto(BASE + '#/budget');
await page.reload();
await page.getByRole('button', { name: 'Revenus', exact: true }).click();
await page.locator('button:has-text("Salaire")').last().click();
await page.waitForTimeout(400);
const vals = await page.locator('[role=dialog] input, .fixed input').evaluateAll((els) => els.map((e) => e.value));
ok('Revenu : le formulaire s’ouvre avec ses valeurs', vals.includes('Salaire') && vals.some((v) => v.startsWith('2100') || v.startsWith('2 100')), JSON.stringify(vals.slice(0, 4)));
await page.keyboard.press('Escape');

// 2. Saisie rapide : date écrite en toutes lettres et durée
await page.goto(BASE + '#/today');
await page.waitForTimeout(500);
await page.locator('[data-testid=fab], [data-testid=fab-desktop]').locator('visible=true').first().click();
await page.getByTestId('quick-input').fill('Rdv coiffeur le 15 décembre 10h');
await page.keyboard.press('Enter');
await page.waitForTimeout(400);
await page.locator('[data-testid=fab], [data-testid=fab-desktop]').locator('visible=true').first().click();
await page.getByTestId('quick-input').fill('Yoga 1h');
await page.keyboard.press('Enter');
await page.waitForTimeout(400);
const tasks = await idb('tasks');
const coif = tasks.find((t) => t.title === 'Rdv coiffeur');
const yoga = tasks.find((t) => t.title === 'Yoga');
ok('Saisie rapide : « le 15 décembre 10h » → rendez-vous le 15 décembre', coif?.date === '2026-12-15' && coif?.time === '10:00' && coif?.kind === 'event', JSON.stringify(coif && { d: coif.date, t: coif.time, k: coif.kind }));
ok('Saisie rapide : « Yoga 1h » → une heure de durée, pas 01:00', yoga && !yoga.time && yoga.duration === 60);

// 3. Supprimer une tâche s'annule
await page.locator('[data-testid=task-item]:has-text("Yoga")').first().click();
await page.waitForTimeout(300);
await page.locator('button.btn-danger:has(.lucide-trash-2)').first().click();
await page.locator('button:has-text("Supprimer ?")').first().click();
await page.waitForTimeout(300);
await page.locator('button:has-text("Annuler")').last().click();
await page.waitForTimeout(500);
ok('Supprimer une tâche : « Annuler » la fait revenir', (await page.locator('[data-testid=task-item]:has-text("Yoga")').count()) === 1);

// 4. Retirer une activité du journal s'annule (avec son commentaire)
await page.goto(BASE + '#/journal/2026-11-28');
await page.waitForTimeout(600);
await page.getByTestId('tracker-tr-apero').click();
await page.getByTestId('item-comment').fill('Au Perchoir avec Léa');
await page.getByTestId('item-comment').blur();
await page.waitForTimeout(400);
await page.getByTestId('item-remove').click();
await page.waitForTimeout(300);
await page.locator('button:has-text("Annuler")').last().click();
await page.waitForTimeout(600);
const log = (await idb('daylogs')).find((l) => l.date === '2026-11-28');
ok('Retirer une activité : « Annuler » la remet avec son commentaire', log?.items.some((i) => i.trackerId === 'tr-apero' && i.detail === 'Au Perchoir avec Léa'));

// 5. Restaurer demande confirmation
await page.goto(BASE + '#/settings');
await page.waitForSelector('text=Sauvegardes et export');
const backup = JSON.stringify({ app: 'life-planner', version: 1, exportedAt: '2026-11-01T10:00:00.000Z', tables: { tasks: [] } });
await page.getByTestId('restore-input').setInputFiles({ name: 'b.json', mimeType: 'application/json', buffer: Buffer.from(backup) });
await page.waitForTimeout(300);
ok('Restaurer : rien n’est remplacé avant confirmation', (await page.getByTestId('restore-confirm').count()) === 1 && (await idb('tasks')).filter((t) => !t.deleted).length >= 2);
await page.getByRole('button', { name: 'Garder mes données' }).click();
ok('Restaurer : « Garder mes données » ne touche à rien', (await idb('tasks')).filter((t) => !t.deleted).length >= 2);

// 6. Un séjour confirmé compte chaque jour dans le journal
await put('tasks', { id: 'stay-maman', kind: 'event', title: 'Week-end chez Maman', priority: 'should', subtasks: [], status: 'todo', date: '2026-11-20', endDate: '2026-11-22', createdAt: 1, updatedAt: 1 });
await page.goto(BASE + '#/today');
await page.reload();
await page.waitForTimeout(800);
if (await page.getByTestId('confirm-older').count()) await page.getByTestId('confirm-older').click();
await page.locator('[data-testid=to-confirm] [data-testid=task-item]:has-text("Maman") [data-testid=outcome-happened]').click();
await page.waitForTimeout(800);
const fam = (await idb('daylogs')).filter((l) => l.items?.some((i) => i.fromEvent === 'stay-maman')).map((l) => l.date).sort();
ok('Séjour confirmé : chaque jour rejoint le journal', fam.join(',') === '2026-11-20,2026-11-21,2026-11-22', fam.join(','));

ok('Aucune erreur dans la page', errors.length === 0, errors.join(' | '));
await browser.close();
const pass = results.filter(Boolean).length;
console.log(`\n${pass}/${results.length}`);
process.exit(pass === results.length ? 0 : 1);
