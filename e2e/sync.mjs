// Synchronisation réelle entre deux appareils via les émulateurs Firebase (Auth + Firestore + règles de sécurité).
import { chromium, devices } from 'playwright';
const BASE = process.env.BASE || 'http://localhost:4173/';
const CFG = `const firebaseConfig = {\n  apiKey: "demo-key",\n  authDomain: "demo-lifeplanner.firebaseapp.com",\n  projectId: "demo-lifeplanner",\n  appId: "1:1:web:1",\n  emulatorHost: "127.0.0.1"\n};`;
const results = [];
const ok = (n, c, x = '') => { results.push(c); console.log(`${c ? '✅' : '❌'} ${n} ${x}`); };
const browser = await chromium.launch();
const errors = [];
async function device(name, dev) {
  const ctx = await browser.newContext({ ...dev, locale: 'fr-FR', timezoneId: 'Europe/Paris' });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(`${name}: ${e.message}`));
  await page.goto(BASE + '#/settings');
  await page.waitForSelector('text=Synchronisation entre appareils');
  return { ctx, page };
}
async function connect(page, create) {
  await page.locator('textarea[placeholder*="firebaseConfig"]').fill(CFG);
  await page.click('text=Enregistrer la configuration');
  await page.fill('input[type=email]', 'anais@test.fr');
  await page.fill('input[type=password]', 'motdepasse123');
  await page.click(create ? 'text=Créer mon compte (1re fois)' : 'text=Se connecter');
  await page.waitForSelector('text=Connectée : anais@test.fr', { timeout: 15000 });
  await page.waitForSelector('text=À jour', { timeout: 20000 });
}
const sync = async (page) => { await page.goto(BASE + '#/settings'); await page.click('button:has-text("Synchroniser")'); await page.waitForTimeout(1500); await page.waitForSelector('text=À jour', { timeout: 15000 }); };
async function addTask(page, title) {
  await page.goto(BASE + '#/today');
  await page.locator('[data-testid=fab], [data-testid=fab-desktop]').locator('visible=true').first().click();
  await page.getByTestId('quick-input').fill(title);
  await page.keyboard.press('Enter');
  await page.waitForTimeout(300);
}

const A = await device('iPhone', devices['iPhone 13']);
// Données créées AVANT d'activer la synchro : doivent être envoyées aussi
await addTask(A.page, 'Tâche créée avant la synchro');
await A.page.goto(BASE + '#/settings');
await connect(A.page, true);
await addTask(A.page, 'Acheter des fleurs');
await sync(A.page);

const B = await device('Mac', { viewport: { width: 1440, height: 900 } });
await connect(B.page, false);
await B.page.goto(BASE + '#/today');
await B.page.waitForTimeout(500);
ok('Le Mac reçoit les tâches de l’iPhone', (await B.page.locator('[data-testid=task-item]:has-text("Acheter des fleurs")').count()) && (await B.page.locator('[data-testid=task-item]:has-text("Tâche créée avant la synchro")').count()));
ok('Catégories par défaut sans doublon', (await B.page.evaluate(async () => new Promise((r) => { const q = indexedDB.open('life-planner'); q.onsuccess = () => { const t = q.result.transaction('categories').objectStore('categories').getAll(); t.onsuccess = () => r(t.result.filter((c) => !c.deleted).length); }; }))) === 9);

// Modifications hors ligne concurrentes sur la même tâche
await A.ctx.setOffline(true);
await B.ctx.setOffline(true);
await A.page.goto(BASE + '#/today');
await A.page.locator('[data-testid=task-item]:has-text("Acheter des fleurs")').click();
await A.page.getByTestId('task-title').fill('Acheter des pivoines');
await A.page.getByTestId('save-task').click();
await B.page.goto(BASE + '#/today');
await B.page.locator('[data-testid=task-item]:has-text("Acheter des fleurs") button[aria-label="Marquer comme faite"]').click();
await addTask(B.page, 'Créée hors ligne sur le Mac');
await A.page.waitForTimeout(500);
await A.ctx.setOffline(false);
await B.ctx.setOffline(false);
await sync(A.page);
await sync(B.page);
await sync(A.page);
for (const [n, d] of [['iPhone', A], ['Mac', B]]) {
  await d.page.goto(BASE + '#/today');
  await d.page.waitForTimeout(400);
  ok(`${n} : titre modifié (iPhone) ET coche (Mac) conservés`, await d.page.locator('[data-testid=task-item]:has-text("Acheter des pivoines") button[aria-label="Marquer comme non faite"]').count());
  ok(`${n} : tâche créée hors ligne présente`, await d.page.locator('[data-testid=task-item]:has-text("Créée hors ligne sur le Mac")').count());
}
// Suppression propagée
await A.page.locator('[data-testid=task-item]:has-text("Tâche créée avant la synchro")').click();
await A.page.locator('[role=dialog] button.btn-danger').click();
await A.page.locator('[role=dialog] button.btn-danger').click();
await sync(A.page);
await sync(B.page);
await B.page.goto(BASE + '#/today');
await B.page.waitForTimeout(400);
ok('Suppression propagée au Mac', !(await B.page.locator('[data-testid=task-item]:has-text("Tâche créée avant la synchro")').count()));

// Isolation : un autre compte ne voit rien
const C = await device('Intrus', devices['iPhone 13']);
await C.page.locator('textarea[placeholder*="firebaseConfig"]').fill(CFG);
await C.page.click('text=Enregistrer la configuration');
await C.page.fill('input[type=email]', 'autre@test.fr');
await C.page.fill('input[type=password]', 'motdepasse123');
await C.page.click('text=Créer mon compte (1re fois)');
await C.page.waitForSelector('text=À jour', { timeout: 20000 });
const leak = await C.page.evaluate(async () => {
  const fs = await import('https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js').catch(() => null);
  return fs ? 'n/a' : 'n/a';
});
await C.page.goto(BASE + '#/today');
ok("Un autre compte ne voit pas les données d'Anaïs", !(await C.page.locator('text=Acheter des pivoines').count()), leak);
await browser.close();
console.log(`\n${results.filter(Boolean).length}/${results.length} vérifications réussies`);
console.log('Erreurs JS :', errors.length ? errors : 'aucune');
