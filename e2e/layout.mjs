// Audit de mise en page : sur plusieurs tailles d'écran, repère tout élément qui dépasse de son conteneur
// (ce qui donne un affichage « décalé »), et tout défilement horizontal de la page.
import { chromium, devices } from 'playwright';
import { mkdirSync } from 'fs';
const BASE = process.env.BASE || 'http://localhost:4173/';
const SIZES = [
  ['iPhone SE', { ...devices['iPhone SE'] }],
  ['iPhone 13', { ...devices['iPhone 13'] }],
  ['iPhone Pro Max', { ...devices['iPhone 14 Pro Max'] }],
  ['iPad', { ...devices['iPad (gen 7)'] }],
  ['Mac', { viewport: { width: 1440, height: 900 } }],
];
const SCREENS = [
  ['today', async (p) => p.goto(BASE + '#/today')],
  ['calendar', async (p) => p.goto(BASE + '#/calendar')],
  ['projects', async (p) => p.goto(BASE + '#/projects')],
  ['budget', async (p) => p.goto(BASE + '#/budget')],
  ['budget-revenus', async (p) => (await p.goto(BASE + '#/budget'), p.getByRole('button', { name: 'Revenus', exact: true }).click())],
  ['budget-fixes', async (p) => (await p.goto(BASE + '#/budget'), p.getByRole('button', { name: 'Fixes', exact: true }).click())],
  ['notes', async (p) => p.goto(BASE + '#/notes')],
  ['journal', async (p) => p.goto(BASE + '#/journal')],
  ['journal-5min', async (p) => p.goto(BASE + '#/journal/fmj')],
  ['journal-stats', async (p) => p.goto(BASE + '#/journal/stats')],
  ['settings', async (p) => p.goto(BASE + '#/settings')],
  ['editeur-tache', async (p) => (await p.goto(BASE + '#/today'), p.locator('[data-testid=task-item]').first().click())],
  ['deplacer', async (p) => (await p.goto(BASE + '#/today'), p.locator('[data-testid=move-btn]').first().click())],
  ['rituel-du-soir', async (p) => (await p.goto(BASE + '#/today'), p.getByTestId('evening-ritual-open').click())],
  ['rituel-souvenir', async (p) => (await p.goto(BASE + '#/today'), await p.getByTestId('evening-ritual-open').click(), p.getByTestId('ritual-next').click())],
  ['essentiels', async (p) => (await p.goto(BASE + '#/today'), p.locator('[data-testid=essentials-pick], [data-testid=essentials-edit]').first().click())],
  ['nouveau-revenu', async (p) => (await p.goto(BASE + '#/budget'), await p.getByRole('button', { name: 'Revenus', exact: true }).click(), p.locator('button.btn-primary:has-text("Revenu")').first().click())],
];
mkdirSync('e2e/shots/layout', { recursive: true });
const browser = await chromium.launch();
let problems = 0;
for (const [devName, dev] of SIZES) {
  const ctx = await browser.newContext({ ...dev, locale: 'fr-FR', timezoneId: 'Europe/Paris' });
  const page = await ctx.newPage();
  await page.clock.install({ time: new Date('2026-11-26T21:00:00+01:00') });
  await page.goto(BASE + '#/settings');
  await page.waitForSelector('text=Sauvegardes et export');
  await page.locator('input[type=file][accept*=json]').setInputFiles('e2e/qa-3mois.json');
  await page.waitForTimeout(1500);
  await page.reload();
  await page.waitForTimeout(800);
  for (const [name, go] of SCREENS) {
    try {
      await go(page);
    } catch (e) {
      console.log(`⚠️ ${devName} · ${name} : écran non ouvert (${e.message.split('\n')[0]})`);
      continue;
    }
    await page.waitForTimeout(700);
    const found = await page.evaluate(() => {
      const out = [];
      const desc = (el) => {
        const t = (el.getAttribute('data-testid') || el.getAttribute('aria-label') || el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 40);
        return `${el.tagName.toLowerCase()}${el.className && typeof el.className === 'string' ? '.' + el.className.split(' ').slice(0, 3).join('.') : ''} « ${t} »`;
      };
      const scrollsX = (el) => {
        for (let a = el.parentElement; a; a = a.parentElement) {
          const s = getComputedStyle(a);
          if (/(auto|scroll)/.test(s.overflowX) && a.scrollWidth > a.clientWidth) return true;
        }
        return false;
      };
      const vw = document.documentElement.clientWidth;
      if (document.documentElement.scrollWidth > vw + 1) out.push(`page plus large que l'écran (${document.documentElement.scrollWidth} > ${vw})`);
      for (const el of document.querySelectorAll('body *')) {
        const r = el.getBoundingClientRect();
        if (!r.width || !r.height) continue;
        const st = getComputedStyle(el);
        if (st.position === 'fixed' || st.visibility === 'hidden') continue;
        const p = el.parentElement;
        if (!p || p === document.body) continue;
        const ps = getComputedStyle(p);
        if (ps.display === 'contents') continue;
        // Rangées volontairement « bord à bord » (marges négatives) : pas un débordement.
        if (parseFloat(st.marginLeft) < 0 || parseFloat(st.marginRight) < 0) continue;
        const pr = p.getBoundingClientRect();
        // marge tolérée : 1px, plus les anneaux/ombres (pas mesurés ici)
        const over = r.right - (pr.right - parseFloat(ps.borderRightWidth)) ;
        const under = pr.left + parseFloat(ps.borderLeftWidth) - r.left;
        if ((over > 1.5 || under > 1.5) && !scrollsX(el) && st.position !== 'absolute' && ps.overflowX === 'visible') {
          out.push(`${desc(el)} dépasse de ${Math.round(Math.max(over, under))}px de ${desc(p)}`);
        }
        if (r.right > vw + 1 && !scrollsX(el) && st.position !== 'absolute') out.push(`${desc(el)} sort de l'écran (${Math.round(r.right - vw)}px)`);
      }
      return [...new Set(out)].slice(0, 12);
    });
    if (process.env.SHOTS && devName === 'iPhone 13') await page.screenshot({ path: `e2e/shots/layout/all-${name}.png`, fullPage: true });
    if (found.length) {
      problems += found.length;
      console.log(`❌ ${devName} · ${name}`);
      for (const f of found) console.log('   ' + f);
      await page.screenshot({ path: `e2e/shots/layout/${devName.replace(/\s/g, '-')}-${name}.png`, fullPage: true });
    }
    await page.keyboard.press('Escape').catch(() => {});
  }
  await ctx.close();
}
await browser.close();
console.log(problems ? `\n${problems} problème(s) de mise en page` : '\nAucun élément ne dépasse, sur aucune taille d’écran');
process.exit(problems ? 1 : 0);
