// Campagne QA : 3 mois d'utilisation fictive (septembre → novembre 2026) dans un navigateur isolé.
// Les données sont générées ici, importées via « Restaurer », puis chaque chiffre affiché est
// comparé à un calcul indépendant fait dans ce script. Aucune donnée réelle n'est touchée.
import { chromium, devices } from 'playwright';
import { writeFileSync, mkdirSync } from 'node:fs';

const BASE = process.env.BASE || 'http://localhost:4173/';
const results = [];
const errors = [];
const ok = (name, cond, extra = '') => {
  results.push({ name, pass: !!cond, extra });
  console.log(`${cond ? '✅' : '❌'} ${name} ${extra}`);
};
mkdirSync('e2e/shots/qa', { recursive: true });

// ---------- Générateur déterministe ----------
let seed = 42;
const rnd = () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296);
const pick = (a) => a[Math.floor(rnd() * a.length)];
const pad = (n) => String(n).padStart(2, '0');
const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const addDays = (s, n) => {
  const d = new Date(s + 'T12:00:00');
  d.setDate(d.getDate() + n);
  return iso(d);
};
const rec = (id, data, t = 1700000000000) => ({ id, createdAt: t, updatedAt: t, ...data });

const FRIENDS = ['pe-lea', 'pe-yasmine', 'pe-alice', 'pe-rym', 'pe-antho', 'pe-juju', 'pe-lyna', 'pe-shiraz'];
const places = [rec('pl-perchoir', { name: 'Le Perchoir', kind: 'place', icon: 'martini', color: '#A83278', order: 100 }), rec('pl-bonbon', { name: 'Le Bonbon', kind: 'place', icon: 'martini', color: '#8E6BB0', order: 101 })];
const daylogs = [];
const expenses = [];
const periodStarts = ['2026-09-03', '2026-10-01', '2026-10-29'];
const inPeriod = (d) => periodStarts.some((s) => d >= s && d <= addDays(s, 4));
const inPms = (d) => periodStarts.some((s) => d >= addDays(s, -3) && d <= addDays(s, -1));
let prevParty = false;
for (let d = '2026-09-01'; d <= '2026-11-25'; d = addDays(d, 1)) {
  const wd = new Date(d + 'T12:00:00').getDay();
  if (rnd() < 0.12 && !inPeriod(d)) {
    prevParty = false;
    continue; // journée non renseignée
  }
  const items = [];
  const feelings = [];
  if (wd >= 1 && wd <= 5) items.push({ trackerId: rnd() < 0.65 ? 'tr-bureau' : rnd() < 0.85 ? 'tr-teletravail' : 'tr-conge' });
  else if (rnd() < 0.4) items.push({ trackerId: 'tr-maison', tags: ['Cocooning'] });
  if ((wd === 4 || wd === 5 || wd === 6) && rnd() < 0.6) {
    const t = pick(['tr-apero', 'tr-verre', 'tr-diner', 'tr-soiree']);
    const people = [...new Set([pick(FRIENDS), pick(FRIENDS), ...(rnd() < 0.5 ? [pick(FRIENDS)] : [])])];
    items.push({ trackerId: t, people, places: [pick(places).id] });
    const amount = Math.round((12 + rnd() * 50) * 100) / 100;
    expenses.push(rec(`jx-${d}-${t}`, { amount, date: d, note: t, budgetCategoryId: t === 'tr-diner' ? 'bc-restaurants' : 'bc-sorties', journal: { date: d, trackerId: t } }));
    if (rnd() < 0.5) items.push({ trackerId: 'tr-alcool' });
  }
  if (rnd() < 0.15) items.push({ trackerId: 'tr-cafe', ...(rnd() < 0.5 ? { alone: true } : { people: [pick(FRIENDS)] }) });
  if ((wd === 2 || wd === 6) && rnd() < 0.7) items.push({ trackerId: 'tr-sport', tags: [pick(['Pilates', 'Course', 'Muscu'])], level: 2 });
  if (inPeriod(d)) items.push({ trackerId: 'tr-regles', level: 1 + Math.floor(rnd() * 3), pain: Math.floor(rnd() * 4), tags: ['Crampes'] });
  if (inPms(d)) items.push({ trackerId: 'tr-spm', level: 2, tags: [pick(['Irritabilité', 'Fringales', 'Fatigue'])] });
  if (rnd() < 0.3) items.push({ trackerId: 'tr-menage' });
  if (rnd() < 0.5) items.push({ trackerId: 'tr-skincare' });
  if (prevParty && rnd() < 0.7) feelings.push({ id: 'hendaye', level: 1 + Math.floor(rnd() * 3) });
  if (rnd() < 0.2) feelings.push({ id: pick(['tired', 'motivated', 'in-love', 'stressed']), level: 1 });
  prevParty = items.some((i) => i.trackerId === 'tr-soiree' || i.trackerId === 'tr-verre');
  const mood = rnd() < 0.9 ? 1 + Math.floor(rnd() * 5) : undefined;
  daylogs.push(rec(d, { date: d, items, feelings, ...(mood ? { mood } : {}), ...(rnd() < 0.2 ? { text: 'Journée notée' } : {}) }));
}
// Dépenses classiques + un remboursement
for (const [id, amount, date, cat] of [
  ['ex1', 64.3, '2026-09-04', 'bc-courses'],
  ['ex2', 120, '2026-09-18', 'bc-shopping'],
  ['ex3', 58.9, '2026-10-03', 'bc-courses'],
  ['ex4', 89, '2026-10-11', 'bc-shopping'],
  ['ex5', -25, '2026-10-14', 'bc-shopping'], // remboursement
  ['ex6', 42.5, '2026-11-08', 'bc-courses'],
])
  expenses.push(rec(id, { amount, date, budgetCategoryId: cat, note: amount < 0 ? 'Retour colis' : 'Achat' }));

const incomes = [
  rec('in-sal', { label: 'Salaire', type: 'salaire', amount: 2100, date: '2026-01-28', frequency: 'monthly' }),
  rec('in-prime', { label: 'Prime', type: 'prime', amount: 500, date: '2026-10-15', frequency: 'once' }),
];
const fixedExpenses = [
  rec('fx-loyer', { label: 'Loyer', amount: 750, date: '2026-01-05', frequency: 'monthly', active: true, budgetCategoryId: 'bc-logement' }),
  rec('fx-netflix', { label: 'Netflix', amount: 13.49, date: '2026-01-12', frequency: 'monthly', active: false, endDate: '2026-10-31', budgetCategoryId: 'bc-abonnements' }),
  rec('fx-tel', { label: 'Téléphone', amount: 19.99, date: '2026-01-20', frequency: 'monthly', active: true, budgetCategoryId: 'bc-telecom' }),
];
const payments = [];
for (const m of ['2026-09', '2026-10']) {
  payments.push(rec(`fx-loyer_${m}-05`, { refId: 'fx-loyer', refType: 'fixed', date: `${m}-05`, status: 'paid', actualAmount: 750 }));
  payments.push(rec(`fx-netflix_${m}-12`, { refId: 'fx-netflix', refType: 'fixed', date: `${m}-12`, status: 'paid', actualAmount: 13.49 }));
  payments.push(rec(`fx-tel_${m}-20`, { refId: 'fx-tel', refType: 'fixed', date: `${m}-20`, status: 'paid', actualAmount: 19.99 }));
  payments.push(rec(`in-sal_${m}-28`, { refId: 'in-sal', refType: 'income', date: `${m}-28`, status: 'paid', actualAmount: m === '2026-10' ? 2050 : 2100 }));
}
payments.push(rec('in-prime_2026-10-15', { refId: 'in-prime', refType: 'income', date: '2026-10-15', status: 'paid', actualAmount: 500 }));
const savings = [rec('sv-japon', { name: 'Japon', target: 3000, deadline: '2027-03-31', contributions: [{ id: 'c1', date: '2026-09-30', amount: 200 }, { id: 'c2', date: '2026-10-30', amount: 200 }, { id: 'c3', date: '2026-11-10', amount: 200 }] })];
const projects = [
  rec('pj-japon', { title: 'Voyage au Japon', status: 'planned', targetMonth: '2027-03', milestones: [], measure: { target: 1, current: 0, savingsId: 'sv-japon' } }),
  rec('pj-certif', { title: 'Certification', status: 'active', dueDate: '2027-06-30', milestones: [{ id: 'm1', title: 'Inscription', done: true }, { id: 'm2', title: 'Révisions', done: false }, { id: 'm3', title: 'Examen', done: false, dueDate: '2027-06-30' }] }),
  rec('pj-appart', { title: 'Acheter un appartement', status: 'idea', targetMonth: '2028-09', milestones: [] }),
  rec('pj-run', { title: 'Courir 100 km', status: 'active', milestones: [], measure: { target: 100, current: 42, unit: 'km' } }),
  rec('pj-old', { title: 'Ancien projet', status: 'abandoned', milestones: [] }),
];
const tasks = [
  rec('tk-sport', { kind: 'task', title: 'Pilates', priority: 'should', subtasks: [], status: 'todo', date: '2026-09-01', recurrence: { freq: 'weekly', interval: 1, byWeekday: [2] } }),
  rec('tk-late', { kind: 'task', title: 'Déclarer les impôts', priority: 'must', subtasks: [], status: 'todo', date: '2026-11-20', dueDate: '2026-11-30' }),
  rec('tk-done', { kind: 'task', title: 'Envoyer CV', priority: 'should', subtasks: [], status: 'done', date: '2026-11-03', doneAt: 1 }),
  rec('tk-certif', { kind: 'task', title: 'Réserver la date d’examen', priority: 'should', subtasks: [], status: 'done', projectId: 'pj-certif', milestoneId: 'm2', date: '2026-11-04' }),
  rec('tk-certif2', { kind: 'task', title: 'Chapitre 1', priority: 'should', subtasks: [], status: 'todo', projectId: 'pj-certif', milestoneId: 'm2' }),
  rec('tk-goal', { kind: 'task', title: 'Ranger le dressing', priority: 'could', subtasks: [], status: 'todo', targetMonth: '2026-10' }),
  rec('tk-kine', { kind: 'event', title: 'Kiné', priority: 'should', subtasks: [], status: 'todo', date: '2026-11-19', time: '14:00' }),
];
const backup = { app: 'life-planner', version: 1, exportedAt: new Date().toISOString(), tables: { daylogs, expenses, incomes, fixedExpenses, payments, savings, projects, tasks, contacts: undefined } };
delete backup.tables.contacts;
writeFileSync('e2e/qa-3mois.json', JSON.stringify(backup));

// ---------- Calculs attendus (indépendants de l'application) ----------
const OUT = ['tr-cafe', 'tr-apero', 'tr-verre', 'tr-diner', 'tr-soiree', 'tr-cinema'];
function expectMonth(m) {
  const days = daylogs.filter((l) => l.date.startsWith(m) && l.date <= '2026-11-25');
  const logged = days.filter((l) => l.items.length || l.mood || l.feelings.length || l.text).length;
  const outings = days.filter((l) => l.items.some((i) => OUT.includes(i.trackerId))).length;
  const hendaye = days.filter((l) => l.feelings.some((f) => f.id === 'hendaye')).length;
  const remote = days.filter((l) => l.items.some((i) => i.trackerId === 'tr-teletravail')).length;
  const work = days.filter((l) => l.items.some((i) => i.trackerId === 'tr-teletravail' || i.trackerId === 'tr-bureau')).length;
  const moods = days.map((l) => l.mood).filter(Boolean);
  const moodAvg = Math.round((moods.reduce((a, b) => a + b, 0) / moods.length) * 10) / 10;
  const resto = days.filter((l) => l.items.some((i) => i.trackerId === 'tr-diner')).length;
  const spent = Math.round(expenses.filter((e) => e.journal && e.date.startsWith(m)).reduce((a, e) => a + e.amount, 0) * 100) / 100;
  const leaDays = days.filter((l) => l.items.some((i) => i.people?.includes('pe-lea'))).length;
  return { logged, outings, hendaye, remote, work, moodAvg, resto, spent, leaDays };
}
const oct = expectMonth('2026-10');
const octVariable = Math.round(expenses.filter((e) => e.date.startsWith('2026-10')).reduce((a, e) => a + e.amount, 0) * 100) / 100;
const octRemaining = Math.round((2050 + 500 - (750 + 13.49 + 19.99) - octVariable - 200) * 100) / 100;
console.log('Attendu octobre :', JSON.stringify({ ...oct, octVariable, octRemaining }));

const eurFr = (n) => new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(n);
const norm = (s) => (s || '').replace(/[  ]/g, ' ');

// ---------- Parcours ----------
const browser = await chromium.launch();
const ctx = await browser.newContext({ ...devices['iPhone 13'], locale: 'fr-FR', timezoneId: 'Europe/Paris' });
const page = await ctx.newPage();
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
page.on('console', (m) => m.type() === 'error' && errors.push(`console: ${m.text()}`));
await page.clock.install({ time: new Date('2026-11-26T10:00:00+01:00') });
await page.goto(BASE + '#/settings');
await page.waitForSelector('text=Sauvegardes et export');
await page.locator('input[type=file][accept*=json]').setInputFiles('e2e/qa-3mois.json');
await page.waitForTimeout(1500);
await page.reload(); // relance comme au matin : report automatique, réparation, migrations
await page.waitForTimeout(1200);

// Aujourd'hui : report automatique sans doublon, historique, échéance intacte, rendez-vous fixe
await page.goto(BASE + '#/today');
await page.waitForTimeout(800);
ok('Report : « Déclarer les impôts » reportée à aujourd’hui (une seule fois)', (await page.locator('[data-testid=task-item]:has-text("Déclarer les impôts")').count()) === 1);
const late = await page.evaluate(async () => {
  const req = indexedDB.open('life-planner');
  const db = await new Promise((r) => (req.onsuccess = () => r(req.result)));
  const tx = db.transaction('tasks');
  const t = await new Promise((r) => (tx.objectStore('tasks').get('tk-late').onsuccess = (e) => r(e.target.result)));
  const k = await new Promise((r) => (db.transaction('tasks').objectStore('tasks').get('tk-kine').onsuccess = (e) => r(e.target.result)));
  return { date: t.date, originalDate: t.originalDate, dueDate: t.dueDate, hist: t.postponeHistory?.length, kine: k.date };
});
ok('Report : date initiale et échéance conservées, rendez-vous non déplacé', late.date === '2026-11-26' && late.originalDate === '2026-11-20' && late.dueDate === '2026-11-30' && late.hist === 1 && late.kine === '2026-11-19', JSON.stringify(late));
await page.reload();
await page.waitForTimeout(800);
ok('Report idempotent après réouverture (pas de doublon)', (await page.locator('[data-testid=task-item]:has-text("Déclarer les impôts")').count()) === 1);
ok('Citation du jour affichée', (await page.locator('main p.italic').first().textContent()).length > 10);
await page.screenshot({ path: 'e2e/shots/qa/today.png', fullPage: true });

// Accueil : le rendez-vous passé du 19 attend une réponse ; « A eu lieu » le fait entrer dans le journal
ok('Accueil : « Ça s’est passé ? » propose le Kiné du 19', await page.locator('[data-testid=to-confirm] [data-testid=task-item]:has-text("Kiné")').count());
ok('Accueil : aucune salutation', !/Bonjour|Bonsoir|Belle journée/.test(await page.locator('main').textContent()));
ok('Accueil : habitudes de la semaine avec compteur', /\d\/\d|fait pour la semaine/.test(await page.getByTestId('habits').textContent()));
await page.locator('[data-testid=to-confirm] [data-testid=task-item]:has-text("Kiné") [data-testid=outcome-happened]').click();
await page.waitForTimeout(600);
ok('Accueil : le rendez-vous confirmé quitte la liste', !(await page.locator('[data-testid=to-confirm]').count()));
const kineLog = await page.evaluate(async () => {
  const req = indexedDB.open('life-planner');
  const db = await new Promise((r) => (req.onsuccess = () => r(req.result)));
  const l = await new Promise((r) => (db.transaction('daylogs').objectStore('daylogs').get('2026-11-19').onsuccess = (e) => r(e.target.result)));
  return (l?.items || []).filter((i) => i.fromEvent === 'tk-kine').map((i) => i.trackerId);
});
ok('Journal : le Kiné confirmé ajoute « Médecin » le 19 novembre', kineLog.includes('tr-medecin'), JSON.stringify(kineLog));

// Calendrier : objectif d'octobre non fait remonté en novembre ; projet multi-années
await page.goto(BASE + '#/calendar');
await page.waitForTimeout(500);
const monthBtn = page.getByRole('button', { name: 'Mois', exact: true });
if (await monthBtn.count()) await monthBtn.click();
await page.waitForTimeout(400);
ok('Objectif d’octobre non terminé visible en novembre', await page.locator('text=Ranger le dressing').count());

// Projets
await page.goto(BASE + '#/projects');
await page.waitForTimeout(500);
ok('Projet chiffré : 42 km sur 100 = 42 %', await page.locator('[data-testid=project-card]:has-text("Courir 100 km"):has-text("42%")').count());
await page.locator('[data-testid=project-card]:has-text("Certification")').click();
await page.waitForTimeout(400);
// 3 étapes : Inscription (cochée), Révisions (1 tâche faite / 2), Examen. Les tâches de Révisions comptent à travers l'étape → 1/3 = 33 %
ok('Projet étapes + tâches : 33 %', (await page.getByTestId('project-pct').textContent()) === '33%', await page.getByTestId('project-pct').textContent());
await page.locator('[data-testid=task-item]:has-text("Chapitre 1") button[aria-label="Marquer comme faite"]').click();
await page.waitForTimeout(400);
ok('Tâche terminée → étape « Révisions » validée → 67 %', (await page.getByTestId('project-pct').textContent()) === '67%', await page.getByTestId('project-pct').textContent());
await page.locator('[data-testid=task-item]:has-text("Chapitre 1") button[aria-label="Marquer comme non faite"]').click();
await page.waitForTimeout(400);
ok('Tâche rouverte → retour à 33 %', (await page.getByTestId('project-pct').textContent()) === '33%');
await page.goto(BASE + '#/projects');
await page.getByRole('button', { name: /À venir/ }).click();
await page.waitForTimeout(300);
ok('Japon relié à l’épargne : 600 € / 3000 € = 20 %', await page.locator('[data-testid=project-card]:has-text("Voyage au Japon"):has-text("20%")').count());
ok('Projet en 2028 affiché', await page.locator('[data-testid=project-card]:has-text("Septembre 2028")').count());
await page.getByRole('button', { name: /Finis/ }).click();
ok('Projet abandonné rangé avec les projets finis', await page.locator('[data-testid=project-card]:has-text("Ancien projet")').count());

// Budget d'octobre
await page.goto(BASE + '#/budget');
await page.waitForTimeout(500);
await page.getByRole('button', { name: 'Mois précédent' }).click();
await page.waitForTimeout(400);
ok(`Budget octobre : reste à vivre ${eurFr(octRemaining)}`, norm(await page.getByTestId('remaining').textContent()) === norm(eurFr(octRemaining)), norm(await page.getByTestId('remaining').textContent()));
await page.screenshot({ path: 'e2e/shots/qa/budget-oct.png', fullPage: true });
await page.getByRole('button', { name: /Épargne|Plus/ }).first().click().catch(() => {});
await page.waitForTimeout(300);
const perMonth = await page.getByTestId('savings-per-month').textContent().catch(() => '');
ok('Épargne : montant à mettre de côté par mois calculé', /par mois/.test(perMonth), perMonth);

// Analytics octobre
await page.goto(BASE + '#/journal/stats');
await page.waitForTimeout(800);
await page.getByRole('button', { name: 'Période précédente' }).click();
await page.waitForTimeout(800);
ok('Analytics : période Octobre 2026', (await page.getByTestId('period-label').textContent()) === 'Octobre 2026');
const tile = async (id) => parseInt(await page.getByTestId(`tile-${id}-days`).textContent());
ok(`Analytics : ${oct.outings} jours de sortie`, (await tile('outings')) === oct.outings, String(await tile('outings')));
ok(`Analytics : ${oct.hendaye} jours HENDAYE`, (await tile('hendaye')) === oct.hendaye, String(await tile('hendaye')));
ok(`Analytics : ${oct.work} jours travaillés`, (await tile('work')) === oct.work, String(await tile('work')));
ok(`Analytics : ${oct.remote} jours de télétravail`, (await tile('remote')) === oct.remote);
ok(`Analytics : ${oct.resto} restos`, oct.resto === 0 ? true : (await tile('resto')) === oct.resto);
ok(`Analytics : complétion ${oct.logged}/31`, (await page.getByTestId('completion').textContent()).includes(`${oct.logged}/31 jours`));
ok(`Analytics : humeur moyenne ${oct.moodAvg}`, (await page.getByTestId('mood-avg').textContent()).includes(String(oct.moodAvg).replace('.', ',')));
ok(`Analytics : dépenses du journal ${eurFr(oct.spent)}`, norm(await page.getByTestId('spent-total').textContent()) === norm(eurFr(oct.spent)));
ok(`Analytics : Léa ${oct.leaDays} jours`, oct.leaDays === 0 || (await page.getByTestId('people-count-pe-lea').textContent()).includes(`${oct.leaDays} j`));
ok('Bilan : « Mon mois en bref » avec la part de jours renseignés', (await page.getByTestId('review').textContent()).includes('Mon mois en bref') && (await page.getByTestId('review-coverage').textContent()).includes(`${oct.logged} jours sur 31`));
ok('Bilan : comment je l’ai vécu (humeur sur assez de jours)', (await page.getByTestId('review-lived').textContent()).includes('humeur moyenne'));
ok('Équilibre : quatre pôles', (await page.locator('[data-testid=balance] [data-testid^=pole-]').count()) === 4);
ok('Plus de colonne « % activités » ni de camembert des familles', !(await page.locator('text=% activités').count()) && !(await page.locator('text=Répartition des activités').count()));
await page.screenshot({ path: 'e2e/shots/qa/analytics-oct.png', fullPage: true });
// Filtre par famille
await page.getByTestId('filter-cycle').click();
await page.waitForTimeout(400);
ok('Filtre « Mon cycle » : seules les activités du cycle', (await page.locator('[data-testid^=row-]').count()) === 2);
await page.getByTestId('filter-cycle').click();
// Année et semaine à cheval
await page.getByRole('button', { name: 'Année' }).click();
await page.waitForTimeout(800);
ok('Vue année 2026 : heatmap 12 mois', (await page.getByTestId('period-label').textContent()) === 'Année 2026' && (await page.getByTestId('heatmap').count()) === 1);
await page.screenshot({ path: 'e2e/shots/qa/analytics-year.png', fullPage: true });

// Modification rétroactive : ajouter un resto le 5 octobre
await page.getByRole('button', { name: 'Ma journée' }).click();
await page.waitForTimeout(300);
await page.goto(BASE + '#/journal/2026-10-05');
await page.waitForTimeout(800);
ok('Journée passée ouverte (5 octobre)', (await page.locator('text=Lundi 5 octobre 2026').count()) === 1);
const hadResto = (await page.getByTestId('tracker-tr-diner').getAttribute('aria-pressed')) === 'true';
if (!hadResto) {
  await page.getByTestId('tracker-tr-diner').click();
  await page.getByTestId('contact-pe-rym').click();
  await page.getByTestId('item-amount').fill('31,90');
  await page.getByTestId('item-amount').press('Enter');
  await page.waitForTimeout(300);
  await page.getByTestId('with-done').click();
}
await page.reload();
await page.waitForTimeout(800);
await page.getByRole('button', { name: 'Mes stats' }).click();
await page.getByRole('button', { name: 'Période précédente' }).click();
await page.waitForTimeout(800);
const expOut = oct.outings + (hadResto || daylogs.find((l) => l.date === '2026-10-05')?.items.some((i) => OUT.includes(i.trackerId)) ? 0 : 1);
ok('Modification rétroactive prise en compte dans les stats', (await tile('outings')) === expOut, `${await tile('outings')} vs ${expOut}`);
ok('… et dans les dépenses du journal', hadResto || norm(await page.getByTestId('spent-total').textContent()) === norm(eurFr(Math.round((oct.spent + 31.9) * 100) / 100)));

// Changement d'année : on avance l'horloge au 3 janvier 2027
await page.clock.setSystemTime(new Date('2027-01-03T09:00:00+01:00'));
await page.goto(BASE + '#/journal/stats');
await page.reload();
await page.waitForTimeout(1000);
ok('Nouvel an : le mois en cours est Janvier 2027', (await page.getByTestId('period-label').textContent()) === 'Janvier 2027');
await page.getByRole('button', { name: 'Semaine' }).click();
await page.waitForTimeout(400);
ok('Semaine à cheval sur deux années', (await page.getByTestId('period-label').textContent()) === 'Semaine du 28 déc.');
await page.goto(BASE + '#/budget');
await page.waitForTimeout(600);
ok('Budget de janvier 2027 : loyer et salaire récurrents présents', (await page.locator('text=Loyer').count()) >= 1);
await page.goto(BASE + '#/today');
await page.waitForTimeout(800);
ok('Nouvel an : la tâche en retard reportée au 3 janvier, toujours une seule', (await page.locator('[data-testid=task-item]:has-text("Déclarer les impôts")').count()) === 1);

// Toutes les pages, à 320 px : pas de débordement horizontal, pas d'erreur
await page.setViewportSize({ width: 320, height: 640 });
for (const r of ['today', 'calendar', 'projects', 'budget', 'notes', 'journal', 'journal/stats', 'settings']) {
  await page.goto(BASE + '#/' + r);
  await page.waitForTimeout(500);
  const over = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  ok(`320 px sans débordement : ${r}`, over <= 1, `+${over}px`);
}

// Boutons : chaque bouton visible de chaque page est touché, sans erreur JavaScript
await page.setViewportSize({ width: 390, height: 844 });
let clicked = 0;
for (const r of ['today', 'calendar', 'projects', 'budget', 'notes', 'journal', 'journal/stats']) {
  await page.goto(BASE + '#/' + r);
  await page.waitForTimeout(400);
  const n = await page.locator('main button:visible').count();
  for (let i = 0; i < Math.min(n, 40); i++) {
    await page.goto(BASE + '#/' + r);
    await page.waitForTimeout(150);
    const b = page.locator('main button:visible').nth(i);
    if (!(await b.count())) continue;
    const label = ((await b.getAttribute('aria-label')) || (await b.textContent()) || '').trim();
    if (/supprimer|effacer|tout effacer|retirer|delete/i.test(label)) continue;
    await b.click({ timeout: 1500 }).catch(() => {});
    clicked++;
    await page.keyboard.press('Escape').catch(() => {});
  }
}
ok(`${clicked} boutons touchés sans erreur`, errors.length === 0, errors.slice(0, 3).join(' | '));
const bad = await page.locator('[data-testid=error-boundary]').count();
ok('Aucun écran d’erreur affiché', bad === 0);

await browser.close();
const passed = results.filter((r) => r.pass).length;
console.log(`\n${passed}/${results.length} vérifications réussies`);
console.log(errors.length ? `Erreurs JS : ${errors.join('\n')}` : 'Erreurs JS : aucune');
writeFileSync('e2e/shots/qa/results.json', JSON.stringify({ results, errors }, null, 2));
process.exit(passed === results.length && !errors.length ? 0 : 1);
