import { db } from './db';
import type { BaseRecord, BudgetCategory, Category, Collection, TableName } from './types';

// Les données par défaut ont des horodatages à 1 : toute modification réelle (sur n'importe
// quel appareil) l'emporte toujours sur elles lors de la synchronisation.
function seedRec<T extends BaseRecord>(r: Omit<T, 'createdAt' | 'updatedAt' | '_ts'>): T {
  const ts: Record<string, number> = {};
  for (const k of Object.keys(r)) if (k !== 'id') ts[k] = 1;
  return { ...(r as any), createdAt: 1, updatedAt: 1, _ts: ts };
}

export const DEFAULT_CATEGORIES: [string, string, string, string][] = [
  ['cat-perso', 'Personnel', '#A83278', 'heart'],
  ['cat-admin', 'Administratif', '#81265D', 'file-text'],
  ['cat-sante', 'Santé', '#D46A8C', 'stethoscope'],
  ['cat-courses', 'Courses', '#C98A4B', 'shopping-basket'],
  ['cat-maison', 'Maison', '#8E6BB0', 'home'],
  ['cat-travail', 'Travail et carrière', '#5B6FB5', 'briefcase'],
  ['cat-voyages', 'Vacances et voyages', '#3E9C9B', 'plane'],
  ['cat-finances', 'Finances', '#4E9A6A', 'wallet'],
  ['cat-autres', 'Autres', '#9C8A96', 'sparkles'],
];

export const DEFAULT_BUDGET: [string, string, string, string, 'fixed' | 'variable'][] = [
  ['bc-logement', 'Logement', '#81265D', 'home', 'fixed'],
  ['bc-energie', 'Énergie', '#C98A4B', 'zap', 'fixed'],
  ['bc-telecom', 'Téléphone et internet', '#5B6FB5', 'smartphone', 'fixed'],
  ['bc-assurances', 'Assurances', '#3E9C9B', 'shield', 'fixed'],
  ['bc-abonnements', 'Abonnements', '#8E6BB0', 'repeat', 'fixed'],
  ['bc-sport', 'Sport et bien-être', '#D46A8C', 'dumbbell', 'fixed'],
  ['bc-restaurants', 'Restaurants', '#A83278', 'utensils', 'variable'],
  ['bc-shopping', 'Shopping', '#E0789E', 'shopping-bag', 'variable'],
  ['bc-courses', 'Courses', '#C98A4B', 'shopping-basket', 'variable'],
  ['bc-transports', 'Transports', '#5B6FB5', 'car', 'variable'],
  ['bc-sorties', 'Sorties', '#8E6BB0', 'party-popper', 'variable'],
  ['bc-voyages', 'Voyages', '#3E9C9B', 'plane', 'variable'],
  ['bc-sante', 'Santé', '#4E9A6A', 'stethoscope', 'variable'],
  ['bc-autres', 'Autres', '#9C8A96', 'sparkles', 'variable'],
];

export const DEFAULT_COLLECTIONS: [string, string, string, string][] = [
  ['col-recettes', 'Recettes', 'chef-hat', '#C98A4B'],
  ['col-voyages', 'Voyages', 'plane', '#3E9C9B'],
  ['col-restaurants', 'Restaurants', 'utensils', '#A83278'],
  ['col-activites', 'Activités', 'sparkles', '#8E6BB0'],
  ['col-deco', 'Maison et décoration', 'sofa', '#D46A8C'],
  ['col-wishlist', 'Wishlist', 'gift', '#E0789E'],
  ['col-idees', 'Idées', 'lightbulb', '#C9A13B'],
  ['col-perso', 'Notes personnelles', 'notebook-pen', '#81265D'],
];

async function putSeed(table: TableName, recs: BaseRecord[]) {
  const t = db.table_(table);
  for (const r of recs) {
    if (await t.get(r.id)) continue;
    await t.put(r);
    await db.outbox.put({ key: `${table}/${r.id}`, table, id: r.id, updatedAt: r.updatedAt });
  }
}

export async function seedDefaults() {
  const done = await db.meta.get('seeded');
  if (done) return;
  await putSeed(
    'categories',
    DEFAULT_CATEGORIES.map(([id, name, color, icon], i) => seedRec<Category>({ id, name, color, icon, order: i })),
  );
  await putSeed(
    'budgetCategories',
    DEFAULT_BUDGET.map(([id, name, color, icon, kind], i) => seedRec<BudgetCategory>({ id, name, color, icon, kind, order: i })),
  );
  await putSeed(
    'collections',
    DEFAULT_COLLECTIONS.map(([id, name, icon, color], i) => seedRec<Collection>({ id, name, icon, color, order: i })),
  );
  await db.meta.put({ key: 'seeded', value: true });
}
