// Tests fonctionnels de bout en bout (navigateur réel, écran iPhone).
import { chromium, devices } from 'playwright';
const BASE = process.env.BASE || 'http://localhost:4173/';
const results = [];
const errors = [];
const ok = (name, cond, extra = '') => { results.push({ name, pass: !!cond, extra }); console.log(`${cond ? '✅' : '❌'} ${name} ${extra}`); };

const browser = await chromium.launch();
const ctx = await browser.newContext({ ...devices['iPhone 13'], locale: 'fr-FR', timezoneId: 'Europe/Paris' });
const page = await ctx.newPage();
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
page.on('console', (m) => m.type() === 'error' && errors.push(`console: ${m.text()}`));

// Horloge contrôlée : mercredi 25 novembre 2026, 9 h
await page.clock.install({ time: new Date('2026-11-25T09:00:00+01:00') });
await page.goto(BASE);
await page.waitForSelector('text=Ma journée');
ok('Accueil chargé avec salutation', await page.locator('h1').first().textContent().then((t) => /Bonjour/.test(t)));
ok("Date du jour affichée", await page.locator('text=Mercredi 25 novembre').count());

// Ajout rapide en langage naturel
await page.getByTestId('fab').click();
await page.getByTestId('quick-input').fill('Dentiste demain 14h30');
await page.keyboard.press('Enter');
await page.waitForTimeout(300);
// Tâche du jour + cochage
await page.getByTestId('fab').click();
await page.getByTestId('quick-input').fill('Appeler la banque !');
await page.keyboard.press('Enter');
await page.waitForTimeout(300);
ok('Tâche du jour visible', await page.locator('[data-testid=task-item]:has-text("Appeler la banque")').count());
ok('Priorité « ! » comprise', await page.locator('[data-testid=task-item]:has-text("Appeler la banque") >> text=Essentiel').count());
await page.locator('[data-testid=task-item]:has-text("Appeler la banque") button[aria-label="Marquer comme faite"]').click();
await page.waitForTimeout(300);
ok('Progression 100 % après cochage', await page.locator('text=Tout est fait').count());

// Calendrier : la tâche de demain dans les 3 vues
await page.locator('nav button:visible', { hasText: 'Calendrier' }).first().click();
await page.waitForTimeout(200);
await page.getByTestId('month-day-2026-11-26').click();
ok('Vue mois : tâche de demain', await page.locator('[data-testid=task-item]:has-text("Dentiste")').count());
await page.getByRole('button', { name: 'Semaine', exact: true }).click();
ok('Vue semaine : tâche de demain', await page.locator('[data-testid=week-day]:has-text("Dentiste")').count());
await page.locator('[data-testid=week-day]').nth(3).locator('button').first().click(); // jeudi
await page.waitForTimeout(200);
ok('Vue jour (planning) : à 14:30', await page.locator('[data-testid=planning-item]:has-text("Dentiste") >> text=14:30').count());
await page.screenshot({ path: 'e2e/shots/iphone-calendrier-jour.png' });

// Tâche cochée mise à jour partout : visible cochée dans le mois
await page.getByRole('button', { name: 'Mois', exact: true }).click();
await page.getByTestId('month-day-2026-11-25').click();
ok('Tâche cochée apparaît terminée dans le calendrier', await page.locator('[data-testid=task-item]:has-text("Appeler la banque") button[aria-label="Marquer comme non faite"]').count());

// Objectif du mois sans date (décembre)
await page.getByRole('button', { name: 'Suivant' }).click();
await page.click('text=+ Objectif');
await page.getByTestId('task-title').fill('Préparer les cadeaux de Noël');
await page.getByTestId('save-task').click();
await page.waitForTimeout(300);
ok('Objectif de décembre sans date affiché', await page.locator('section:has-text("Mes objectifs de décembre") >> text=Préparer les cadeaux').count());
const inDays = await page.locator('[data-testid^=month-day-]').evaluateAll((els) => els.some((e) => e.querySelector('span span')));
ok("L'objectif n'est attribué à aucun jour", !inDays);
await page.screenshot({ path: 'e2e/shots/iphone-calendrier-mois.png', fullPage: true });

// Tâche non terminée : report automatique le lendemain
await page.locator('nav button:visible', { hasText: 'Aujourd\'hui' }).first().click();
await page.getByTestId('fab').click();
await page.getByTestId('quick-input').fill('Envoyer le dossier');
await page.keyboard.press('Enter');
await page.waitForTimeout(300);
await page.clock.setFixedTime(new Date('2026-11-27T08:00:00+01:00'));
await page.reload();
await page.waitForSelector('text=Ma journée');
ok('Report automatique après 2 jours sans ouvrir', await page.locator('section:has-text("Reportées") >> text=Envoyer le dossier').count());
ok('Tâche terminée non reportée', !(await page.locator('[data-testid=task-item]:has-text("Appeler la banque")').count()));
await page.locator('[data-testid=task-item]:has-text("Envoyer le dossier")').click();
ok('Date initiale conservée', await page.locator('text=Prévue initialement le 25 novembre').count());
await page.keyboard.press('Escape');

// Budget
await page.locator('nav button:visible', { hasText: 'Budget' }).first().click();
await page.click('text=+ Revenu');
await page.locator('input[inputmode=decimal]').first().fill('2500');
await page.click('text=Enregistrer');
await page.waitForTimeout(200);
await page.getByTestId('fab').click();
await page.getByTestId('quick-Dépense').click();
await page.locator('input[aria-label=Montant]').fill('42,50');
await page.locator('[role=dialog] button:has-text("Restaurants")').click();
await page.click('text=Enregistrer');
await page.waitForTimeout(200);
await page.getByRole('button', { name: 'Fixes', exact: true }).click();
await page.click('button:has-text("Dépense fixe")');
await page.locator('input[placeholder="Ex : Loyer"]').fill('Loyer');
await page.locator('input[inputmode=decimal]').fill('850');
await page.locator('input[type=date]').first().fill('2026-11-05');
await page.click('text=Enregistrer');
await page.waitForTimeout(200);
await page.getByRole('button', { name: 'Aperçu', exact: true }).click();
const rem = await page.getByTestId('remaining').textContent();
ok('Reste à vivre = 2500 − 850 − 42,50', rem.replace(/\s/g, '').includes('1607,50'), rem);
await page.screenshot({ path: 'e2e/shots/iphone-budget.png', fullPage: true });
await page.getByRole('button', { name: 'Mois suivant' }).click();
await page.getByRole('button', { name: 'Fixes', exact: true }).click();
await page.waitForTimeout(200);
await page.screenshot({ path: 'e2e/shots/debug-fixes.png' });
ok('Loyer récurrent en décembre (5 déc.)', await page.locator('main >> text=Loyer').count(), await page.locator('main h1').first().textContent());
// prélèvement dans le calendrier
await page.locator('nav button:visible', { hasText: 'Calendrier' }).first().click();
await page.getByRole('button', { name: 'Suivant' }).click();
await page.getByTestId('month-day-2026-12-05').click();
ok('Prélèvement visible dans le calendrier le 5 déc.', await page.locator('text=Loyer').count() && await page.locator('text=non confirmé').count());

// Notes et liens
await page.locator('nav button:visible', { hasText: 'Notes' }).first().click();
await page.getByTestId('fab').click();
await page.getByTestId('quick-Lien').click();
await page.getByTestId('note-url').fill('https://www.tiktok.com/@cuisine/video/123');
await page.getByTestId('save-note').click();
await page.waitForTimeout(300);
ok('Lien TikTok enregistré avec titre auto', await page.locator('[data-testid=note-card]:has-text("TikTok de @cuisine")').count());
await page.getByTestId('fab').click();
await page.getByTestId('quick-Note').click();
await page.getByTestId('note-title').fill('Recette tiramisu');
await page.locator('textarea[aria-label=Texte]').fill('Mascarpone, café, biscuits');
await page.locator('[role=dialog] button:has-text("Recettes")').click();
await page.getByTestId('save-note').click();
await page.waitForTimeout(300);
await page.fill('input[type=search]', 'mascarpone');
ok('Recherche dans les notes', (await page.locator('[data-testid=note-card]').count()) === 1);
await page.fill('input[type=search]', '');
await page.screenshot({ path: 'e2e/shots/iphone-notes.png', fullPage: true });

// Projet
await page.locator('nav button:visible', { hasText: 'Projets' }).first().click();
await page.locator('main button:has-text("Projet")').click();
await page.locator('input[aria-label="Titre du projet"]').fill('Déménagement');
await page.locator('[role=dialog] button.chip', { hasText: 'En cours' }).click();
await page.getByTestId('project-month-toggle').click();
await page.getByRole('button', { name: 'Décembre 2026' }).click();
await page.click('text=Créer');
await page.waitForTimeout(300);
ok('Projet avec mois visé créé sans erreur', (await page.locator('text=Mois visé : Décembre 2026').count()) === 1);
await page.fill('input[placeholder="Nouvelle étape"]', 'Trouver un appartement');
await page.keyboard.press('Enter');
await page.click('text=+ Tâche');
await page.getByTestId('task-title').fill('Résilier la box');
await page.locator('input[aria-label=Date]').fill('2026-11-27');
await page.getByTestId('save-task').click();
await page.waitForTimeout(300);
// Projet dans un mois futur, l'année suivante (le bug signalé)
await page.locator('nav button:visible', { hasText: 'Projets' }).first().click();
await page.locator('main button:has-text("Projet")').click();
await page.locator('input[aria-label="Titre du projet"]').fill('Voyage au Japon');
await page.getByTestId('project-month-toggle').click();
await page.getByRole('button', { name: 'Année suivante' }).click();
await page.getByRole('button', { name: 'Mars 2027' }).click();
await page.click('text=Créer');
await page.waitForTimeout(300);
ok('Projet futur (mars 2027) créé et affiché', (await page.locator('text=Mois visé : Mars 2027').count()) === 1 && (await page.locator('text=À venir').count()) >= 1);
await page.locator('nav button:visible', { hasText: 'Projets' }).first().click();
await page.getByRole('button', { name: /À venir/ }).click();
ok('Projet futur rangé dans « À venir »', await page.locator('[data-testid=project-card]:has-text("Voyage au Japon")').count());
await page.getByRole('button', { name: /En cours/ }).click();
await page.locator('[data-testid=project-card]:has-text("Déménagement")').click();
await page.locator('[data-testid=task-item]:has-text("Résilier la box")').first().waitFor({ timeout: 3000 }).catch(() => {});
ok('Tâche de projet visible', await page.locator('[data-testid=task-item]:has-text("Résilier la box")').count());
await page.locator('nav button:visible', { hasText: 'Aujourd\'hui' }).first().click();
ok('Tâche de projet datée dans Aujourd\'hui', await page.locator('[data-testid=task-item]:has-text("Résilier la box")').count());
await page.locator('[data-testid=task-item]:has-text("Résilier la box") button[aria-label="Marquer comme faite"]').click();
await page.locator('nav button:visible', { hasText: 'Projets' }).first().click();
await page.waitForTimeout(300);
await page.screenshot({ path: 'e2e/shots/debug-projects.png' });
ok('Terminée depuis le planning = progression projet 50 %', await page.locator('[data-testid=project-card]:has-text("50%")').count());
await page.locator('nav button:visible', { hasText: 'Calendrier' }).first().click();
ok('Projet de décembre dans les objectifs du mois', await page.getByRole('button', { name: 'Suivant' }).click().then(() => page.locator('text=Déménagement').count()));

// Journal des journées
await page.locator('nav button:visible', { hasText: 'Journal' }).first().click();
await page.getByTestId('mood-5').click();
await page.getByTestId('tracker-tr-apero').click();
await page.getByTestId('contact-pe-lea').click();
await page.getByTestId('contact-pe-austin').click();
await page.getByTestId('add-place').click();
await page.getByTestId('new-place').fill('le Perchoir');
await page.keyboard.press('Enter');
await page.waitForTimeout(300);
await page.getByTestId('item-amount').fill('18,50');
await page.getByTestId('item-amount').press('Enter');
await page.waitForTimeout(300);
await page.getByTestId('with-done').click();
await page.getByTestId('tracker-tr-alcool').click();
ok('Journal : « Alcool » ne demande pas avec qui', (await page.locator('[data-testid=item-panel] >> text=Avec qui ?').count()) === 0);
await page.getByTestId('with-done').click();
await page.getByTestId('tracker-tr-spm').click();
await page.getByTestId('tag-Fringales').waitFor();
ok('Journal : SPM propose symptômes et intensité, pas « avec qui »', (await page.locator('[data-testid=item-panel] >> text=Avec qui ?').count()) === 0 && (await page.getByTestId('tag-Fringales').count()) === 1 && (await page.getByTestId('level-2').count()) === 1);
await page.getByTestId('tag-Fringales').click();
await page.getByTestId('level-2').click();
await page.getByTestId('with-done').click();
await page.getByTestId('feeling-hendaye').click();
await page.getByTestId('feelings-tab-heart').click();
await page.getByTestId('feeling-in-love').click();
await page.getByTestId('feeling-in-love').click();
await page.waitForTimeout(300);
ok('Journal : plusieurs états, intensité qui monte', (await page.getByTestId('feeling-in-love').getAttribute('aria-label')).includes('2 sur 3') && (await page.getByTestId('feeling-on-hendaye').getAttribute('aria-pressed')) === 'true');
ok('Journal : pas de défilement horizontal sur iPhone', await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth));
ok('Journal : états rangés par familles (Corps · 1)', (await page.getByTestId('feelings-tab-body').textContent()).includes('1'));
await page.getByTestId('feelings-tab-body').click();
await page.getByTestId('sleep-bed').fill('23:40');
await page.getByTestId('sleep-wake').fill('07:25');
await page.getByTestId('sleep-q-3').click();
await page.waitForTimeout(300);
ok('Sommeil : durée de la nuit calculée (7 h 45)', (await page.getByTestId('sleep-duration').textContent()).includes('7 h 45'));
await page.getByTestId('fmj-tab-morning').click();
await page.getByTestId('fmj-grateful-0').fill('un matcha au soleil');
await page.getByTestId('fmj-grateful-1').fill('Léa');
await page.getByTestId('fmj-affirmation').fill('I am enough');
await page.getByTestId('fmj-tab-evening').click();
await page.getByTestId('fmj-amazing-0').fill('fou rire au Perchoir');
await page.waitForTimeout(900);
ok('Five Minute Journal : 4 champs sur 11', (await page.getByTestId('fmj-count').textContent()).trim() === '4/11');
ok('Journal : apéro avec Léa, Austin au Perchoir et dépense affichés', await page.locator('[data-testid=tracker-tr-apero]:has-text("Léa, Austin, Le Perchoir")').count() && await page.locator('[data-testid=tracker-tr-apero]:has-text("18,50")').count());
await page.getByTestId('day-text').fill('Super soirée');
await page.locator('button[aria-label="Jour précédent"]').click(); // tout de suite : le texte ne doit pas se perdre
await page.waitForTimeout(300);
ok('Journal : le jour précédent n’affiche pas les infos du jour suivant', (await page.getByTestId('mood-5').getAttribute('aria-checked')) === 'false' && (await page.getByTestId('feeling-hendaye').getAttribute('aria-pressed')) === 'false');
await page.screenshot({ path: 'e2e/shots/iphone-journal-amis.png' });
await page.getByTestId('mood-3').click();
await page.getByTestId('tracker-tr-cinema').click();
await page.getByTestId('contact-pe-lea').click();
await page.getByTestId('with-done').click();
await page.locator('button[aria-label="Jour suivant"]').click();
await page.waitForTimeout(400);
ok('Journal : texte tapé juste avant de changer de jour conservé', (await page.getByTestId('day-text').inputValue()) === 'Super soirée');
await page.getByRole('button', { name: 'Mes stats' }).click();
await page.waitForTimeout(500);
ok('Analytics : 2 jours de sortie', (await page.getByTestId('tile-outings-days').textContent()).startsWith('2'));
ok('Analytics : HENDAYE 1 jour', (await page.getByTestId('tile-hendaye-days').textContent()).startsWith('1'));
ok('Analytics : humeur moyenne 4', (await page.getByTestId('mood-avg').textContent()).includes('4'));
ok('Analytics : Léa vue 2 jours', (await page.getByTestId('people-count-pe-lea').textContent()).includes('2 j'));
ok('Analytics : nouveau lieu créé une seule fois', (await page.locator('[data-testid^=place-count-]', { hasText: 'Perchoir' }).count()) === 1);
ok('Analytics : complétion du journal affichée', /2\/\d+ jours/.test(await page.getByTestId('completion').textContent()));
ok('Analytics : dépenses du journal 18,50 €', (await page.getByTestId('spent-total').textContent()).includes('18,50'));
ok('Analytics : Wrapped du mois', (await page.getByTestId('wrapped').locator('> div').count()) >= 4);
ok('Analytics : sommeil moyen 7 h 45', (await page.getByTestId('sleep-avg').textContent()).includes('7 h 45'));
ok('Analytics : Five Minute Journal 1 jour', (await page.getByTestId('fmj-days').textContent()).trim() === '1');
ok('Analytics : rendez-vous et tâches de l’agenda visibles', (await page.getByTestId('agenda-stats').count()) === 1);
{
  const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 8000 }), page.getByTestId('wrapped-share').click()]);
  const file = await dl.path();
  const fs = await import('node:fs');
  const buf = fs.readFileSync(file);
  ok('Wrapped : image PNG créée (story 1080×1920)', buf.slice(1, 4).toString() === 'PNG' && buf.readUInt32BE(16) === 1080 && buf.readUInt32BE(20) === 1920);
  fs.copyFileSync(file, 'e2e/shots/wrapped.png');
}
await page.locator('nav button:visible', { hasText: 'Aujourd' }).first().click();
await page.getByTestId('habit-tr-skincare').click();
await page.waitForTimeout(300);
ok("Aujourd'hui : habitude cochée d'un geste", (await page.getByTestId('habit-tr-skincare').getAttribute('aria-pressed')) === 'true');
ok("Aujourd'hui : rappel du Five Minute Journal", (await page.getByTestId('fmj-nudge').textContent()).includes('Fait'));
await page.screenshot({ path: 'e2e/shots/iphone-today-habits.png', fullPage: true });
await page.locator('nav button:visible', { hasText: 'Journal' }).first().click();
await page.waitForTimeout(300);
ok('Journal : l’habitude cochée apparaît dans la journée', (await page.getByTestId('tracker-tr-skincare').getAttribute('aria-pressed')) === 'true');
await page.screenshot({ path: 'e2e/shots/iphone-journal-v5.png', fullPage: true });
await page.screenshot({ path: 'e2e/shots/iphone-journal.png', fullPage: true });
await page.locator('nav button:visible', { hasText: 'Budget' }).first().click();
await page.waitForTimeout(300);
await page.getByRole('button', { name: /Variables/ }).click();
await page.waitForTimeout(300);
ok('Budget : la dépense du journal apparaît une seule fois', (await page.locator('text=Apéro · Léa, Austin, Le Perchoir').count()) === 1);

// Persistance après fermeture
await page.close();
const page2 = await ctx.newPage();
page2.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
await page2.clock.install({ time: new Date('2026-11-27T08:05:00+01:00') });
await page2.goto(BASE + '#/notes');
await page2.waitForSelector('[data-testid=note-card]');
ok('Données conservées après fermeture', (await page2.locator('[data-testid=note-card]').count()) === 2);

// Hors ligne
await page2.waitForTimeout(1500);
await ctx.setOffline(true);
await page2.reload();
await page2.waitForSelector('text=Notes et inspirations', { timeout: 8000 }).catch(() => {});
ok('Application chargée hors ligne', await page2.locator('text=Notes et inspirations').count());
await page2.locator('nav button:visible', { hasText: 'Aujourd\'hui' }).first().click();
await page2.getByTestId('fab').click();
await page2.getByTestId('quick-input').fill('Tâche hors ligne');
await page2.keyboard.press('Enter');
await page2.waitForTimeout(300);
ok('Ajout de tâche hors ligne', await page2.locator('text=Tâche hors ligne').count());
await ctx.setOffline(false);

await browser.close();
const fails = results.filter((r) => !r.pass);
console.log(`\n${results.length - fails.length}/${results.length} vérifications réussies`);
const relevant = errors.filter((e) => !/favicon|Failed to load resource.*(404|net::ERR_INTERNET_DISCONNECTED)/.test(e));
console.log('Erreurs JS :', relevant.length ? relevant : 'aucune');
process.exit(fails.length || relevant.length ? 1 : 0);
