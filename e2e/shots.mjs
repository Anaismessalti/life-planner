// Captures d'écran iPhone / iPad / Mac avec des données de démonstration (importées via « Restaurer »).
import { chromium, devices } from 'playwright';
import { writeFileSync } from 'node:fs';
const BASE = process.env.BASE || 'http://localhost:4173/';
const T = 1764000000000;
const r = (id, o) => ({ id, createdAt: T, updatedAt: T, ...o });
const t = (id, title, o = {}) => r(id, { kind: 'task', title, priority: 'should', subtasks: [], status: 'todo', ...o });
const backup = {
  app: 'life-planner', version: 1, exportedAt: new Date().toISOString(),
  tables: {
    settings: [r('userName', { value: 'Anaïs' })],
    tasks: [
      t('a', 'Rendez-vous dermatologue', { kind: 'event', date: '2026-11-25', time: '10:30', duration: 45, categoryId: 'cat-sante', location: 'Paris 11e' }),
      t('b', 'Envoyer le dossier CAF', { date: '2026-11-25', priority: 'must', categoryId: 'cat-admin', dueDate: '2026-11-27', postponeHistory: [{ from: '2026-11-24', to: '2026-11-25', at: T }], originalDate: '2026-11-24' }),
      t('c', 'Courses de la semaine', { date: '2026-11-25', categoryId: 'cat-courses', subtasks: [{ id: 's1', title: 'Fruits', done: true }, { id: 's2', title: 'Lessive', done: false }] }),
      t('d', 'Yoga', { date: '2026-11-25', time: '18:30', duration: 60, categoryId: 'cat-perso', status: 'done' }),
      t('e', 'Réviser module 3 certification', { date: '2026-11-25', time: '14:00', duration: 90, categoryId: 'cat-travail', projectId: 'p1', priority: 'must' }),
      t('f', 'Arroser les plantes', { date: '2026-11-25', priority: 'could', categoryId: 'cat-maison', recurrence: undefined }),
      t('g', 'Ménage', { date: '2026-11-02', categoryId: 'cat-maison', recurrence: { freq: 'weekly', interval: 1, byWeekday: [6] } }),
      t('h', 'Dîner chez Léa', { kind: 'event', date: '2026-11-27', time: '20:00', categoryId: 'cat-perso' }),
      t('i', 'Réserver les billets de train', { date: '2026-11-26', categoryId: 'cat-voyages', projectId: 'p2' }),
      t('j', 'Préparer les cadeaux de Noël', { targetMonth: '2026-11', categoryId: 'cat-perso' }),
      t('k', 'Trier les papiers', { categoryId: 'cat-admin' }),
    ],
    projects: [
      r('p1', { title: 'Certification PMP', status: 'active', categoryId: 'cat-travail', dueDate: '2027-02-15', milestones: [{ id: 'm1', title: 'Inscription', done: true }, { id: 'm2', title: 'Modules 1 à 4', done: false }, { id: 'm3', title: 'Examen blanc', done: false }] }),
      r('p2', { title: 'Week-end à Lisbonne', status: 'active', categoryId: 'cat-voyages', targetMonth: '2026-11', milestones: [{ id: 'm4', title: 'Choisir les dates', done: true }, { id: 'm5', title: 'Réserver logement', done: true }] }),
      r('p3', { title: 'Déménagement', status: 'planned', categoryId: 'cat-maison', targetMonth: '2027-03', milestones: [] }),
    ],
    incomes: [r('i1', { label: 'Salaire', type: 'salaire', amount: 2650, date: '2026-01-28', frequency: 'monthly' })],
    fixedExpenses: [
      r('f1', { label: 'Loyer', amount: 890, date: '2026-01-05', frequency: 'monthly', active: true, budgetCategoryId: 'bc-logement' }),
      r('f2', { label: 'Électricité', amount: 64.9, date: '2026-01-12', frequency: 'monthly', active: true, budgetCategoryId: 'bc-energie' }),
      r('f3', { label: 'Forfait mobile', amount: 19.99, date: '2026-01-25', frequency: 'monthly', active: true, budgetCategoryId: 'bc-telecom' }),
      r('f4', { label: 'Salle de sport', amount: 34.9, date: '2026-01-25', frequency: 'monthly', active: true, budgetCategoryId: 'bc-sport' }),
      r('f5', { label: 'Netflix', amount: 13.49, date: '2026-01-28', frequency: 'monthly', active: true, budgetCategoryId: 'bc-abonnements' }),
    ],
    payments: [r('f1_2026-11-05', { refId: 'f1', refType: 'fixed', date: '2026-11-05', status: 'paid' }), r('f2_2026-11-12', { refId: 'f2', refType: 'fixed', date: '2026-11-12', status: 'paid' })],
    expenses: [
      r('e1', { amount: 38.5, date: '2026-11-08', budgetCategoryId: 'bc-restaurants', note: 'Brunch' }),
      r('e2', { amount: 79.9, date: '2026-11-15', budgetCategoryId: 'bc-shopping', note: 'Pull' }),
      r('e3', { amount: 112.4, date: '2026-11-20', budgetCategoryId: 'bc-courses' }),
      r('e4', { amount: 24, date: '2026-11-22', budgetCategoryId: 'bc-sorties', note: 'Cinéma' }),
    ],
    savings: [r('s1', { name: 'Voyage au Japon', target: 3000, contributions: [{ id: 'c1', date: '2026-11-02', amount: 150 }, { id: 'c2', date: '2026-10-02', amount: 900 }] })],
    daylogs: [
      ['2026-11-01', 5, ['tr-apero:chez Sarah', 'tr-alcool']], ['2026-11-02', 3, ['tr-bureau']], ['2026-11-03', 4, ['tr-bureau', 'tr-sport']],
      ['2026-11-05', 2, ['tr-teletravail']], ['2026-11-07', 5, ['tr-diner:avec Léa', 'tr-verre:avec Léa', 'tr-alcool', 'tr-derive']],
      ['2026-11-08', 4, ['tr-cinema:avec Léa']], ['2026-11-12', 3, ['tr-bureau']], ['2026-11-14', 5, ['tr-soiree:chez Inès', 'tr-alcool']],
      ['2026-11-15', 4, ['tr-cafe:avec Maman']], ['2026-11-20', 1, ['tr-bureau']], ['2026-11-21', 4, ['tr-apero:chez Sarah', 'tr-alcool']],
      ['2026-11-22', 5, ['tr-voyage', 'tr-conge']], ['2026-11-23', 5, ['tr-voyage', 'tr-conge']], ['2026-11-24', 3, ['tr-bureau', 'tr-sport']],
    ].map(([date, mood, items]) => r(date, { date, mood, items: items.map((x) => { const [trackerId, detail] = x.split(':'); return detail ? { trackerId, detail } : { trackerId }; }) })),
    notes: [
      r('n1', { title: 'Tiramisu de Mamie', text: '3 œufs, 250 g de mascarpone, café fort, biscuits à la cuillère.\nRepos 6 h au frais.', collectionId: 'col-recettes', tags: ['dessert'], favorite: true }),
      r('n2', { title: 'TikTok de @parisfood', url: 'https://www.tiktok.com/@parisfood/video/1', collectionId: 'col-restaurants', tags: ['paris'], favorite: false }),
      r('n3', { title: 'Reel Instagram', url: 'https://www.instagram.com/reel/abc', collectionId: 'col-deco', tags: ['salon'], favorite: false }),
      r('n4', { title: 'Idées week-end', text: 'Giverny, Étretat, marché de Noël de Strasbourg', collectionId: 'col-activites', tags: [], favorite: true }),
      r('n5', { title: 'Wishlist', text: 'Bougie Diptyque\nCarnet Moleskine rose\nSac Polène', collectionId: 'col-wishlist', tags: ['cadeaux'], favorite: false }),
    ],
  },
};
writeFileSync('e2e/demo-backup.json', JSON.stringify(backup));

const browser = await chromium.launch();
const targets = [
  ['iphone', { ...devices['iPhone 13'] }],
  ['ipad', { ...devices['iPad (gen 7)'] }],
  ['mac', { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 }],
];
const pages = ['today', 'calendar', 'projects', 'budget', 'notes', 'journal', 'settings'];
const errors = [];
for (const [name, dev] of targets) {
  for (const dark of [false, true]) {
    if (dark && name !== 'iphone') continue;
    const ctx = await browser.newContext({ ...dev, locale: 'fr-FR', timezoneId: 'Europe/Paris', colorScheme: dark ? 'dark' : 'light' });
    const page = await ctx.newPage();
    page.on('pageerror', (e) => errors.push(`${name}: ${e.message}`));
    await page.clock.install({ time: new Date('2026-11-25T09:00:00+01:00') });
    await page.goto(BASE + '#/settings');
    await page.waitForSelector('text=Sauvegardes et export');
    await page.locator('input[type=file][accept*=json]').setInputFiles('e2e/demo-backup.json');
await page.getByTestId('restore-go').click(); // confirmation avant de remplacer
    await page.waitForTimeout(800);
    if (dark) await page.evaluate(() => { localStorage.setItem('theme', 'dark'); });
    for (const p of pages) {
      await page.goto(BASE + '#/' + p);
      if (dark) await page.reload();
      await page.waitForTimeout(500);
      await page.screenshot({ path: `e2e/shots/${name}${dark ? '-dark' : ''}-${p}.png`, fullPage: name === 'iphone' && !dark });
      if (dark && p === 'budget') break;
    }
    if (!dark) {
      await page.goto(BASE + '#/today');
      await page.waitForTimeout(300);
      await page.getByTestId(name === 'iphone' ? 'fab' : 'fab-desktop').click();
      await page.waitForTimeout(400);
      await page.screenshot({ path: `e2e/shots/${name}-quickadd.png` });
    }
    await ctx.close();
  }
}
await browser.close();
console.log('Erreurs :', errors.length ? errors : 'aucune');
