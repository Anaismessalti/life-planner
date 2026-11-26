import { db } from './db';
import type { BaseRecord, BudgetCategory, Category, Collection, Contact, TableName, Tracker } from './types';
import { COLORS } from '../lib/icons';

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

export const DEFAULT_TRACKERS: [string, string, string, string, Tracker['group']][] = [
  ['tr-cafe', 'Café avec des amis', 'coffee', '#C98A4B', 'sorties'],
  ['tr-apero', 'Apéro', 'martini', '#E0789E', 'sorties'],
  ['tr-verre', 'Verre en ville', 'wine', '#A83278', 'sorties'],
  ['tr-diner', 'Dîner', 'utensils', '#D46A8C', 'sorties'],
  ['tr-soiree', 'Soirée', 'party-popper', '#8E6BB0', 'sorties'],
  ['tr-cinema', 'Cinéma', 'film', '#5B6FB5', 'sorties'],
  ['tr-alcool', 'Alcool', 'beer', '#C9A13B', 'moi'],
  ['tr-derive', 'Dérive', 'flame', '#E0457B', 'moi'],
  ['tr-sport', 'Sport', 'dumbbell', '#4E9A6A', 'moi'],
  ['tr-bureau', 'Bureau', 'briefcase', '#81265D', 'travail'],
  ['tr-teletravail', 'Télétravail', 'laptop', '#3E9C9B', 'travail'],
  ['tr-conge', 'Congé', 'palm', '#C98A4B', 'travail'],
  ['tr-voyage', 'Voyage', 'plane', '#3E9C9B', 'travail'],
];

/** Ajoutés dans une mise à jour : la vie d'une jeune femme de 25 ans (amour, famille, santé, sorties…). */
export const LIFE_TRACKERS: [string, string, string, string, Tracker['group']][] = [
  ['tr-brunch', 'Brunch', 'croissant', '#C98A4B', 'sorties'],
  ['tr-boite', 'Boîte', 'disc', '#8E6BB0', 'sorties'],
  ['tr-concert', 'Concert / festival', 'mic', '#A83278', 'sorties'],
  ['tr-expo', 'Expo / musée', 'landmark', '#5B6FB5', 'sorties'],
  ['tr-shopping', 'Shopping', 'shopping-bag', '#E0789E', 'sorties'],
  ['tr-date', 'Rencard', 'heart', '#E0457B', 'amour'],
  ['tr-couple', 'Moment à deux', 'couple', '#D46A8C', 'amour'],
  ['tr-match', 'Match / appli', 'match', '#C7A0C9', 'amour'],
  ['tr-crush', 'Crush', 'sparkles', '#E0789E', 'amour'],
  ['tr-ex', 'Contact avec un ex', 'heart-crack', '#9C8A96', 'amour'],
  ['tr-famille', 'Repas de famille', 'home', '#C98A4B', 'social'],
  ['tr-appel', 'Appel / FaceTime', 'phone', '#5B6FB5', 'social'],
  ['tr-recevoir', 'Recevoir chez moi', 'sofa', '#8E6BB0', 'social'],
  ['tr-anniv', 'Anniversaire', 'cake', '#A83278', 'social'],
  ['tr-medecin', 'Rendez-vous santé', 'stethoscope', '#3E9C9B', 'sante'],
  ['tr-malade', 'Malade', 'thermometer', '#9C8A96', 'sante'],
  ['tr-eau', '1,5 L d’eau', 'droplets', '#3E9C9B', 'sante'],
  ['tr-pas', '10 000 pas', 'footprints', '#4E9A6A', 'sante'],
  ['tr-pilule', 'Pilule oubliée', 'pill', '#C0395A', 'sante'],
  ['tr-craquage', 'Craquage shopping', 'shopping-bag', '#C0395A', 'moi'],
  ['tr-nospend', 'Journée sans dépense', 'piggy', '#4E9A6A', 'moi'],
  ['tr-detox', 'Détox réseaux', 'ban', '#4E9A6A', 'moi'],
  ['tr-scroll', 'Trop scrollé', 'smartphone', '#9C8A96', 'moi'],
  ['tr-journaling', 'Journaling', 'notebook-pen', '#A83278', 'soin'],
  ['tr-creatif', 'Moment créatif', 'palette', '#8E6BB0', 'soin'],
  ['tr-entretien', 'Entretien', 'briefcase', '#81265D', 'travail'],
  ['tr-side', 'Side project', 'lightbulb', '#C9A13B', 'travail'],
];

/** Ajoutés dans une mise à jour : maison, soin de soi et études. */
export const MORE_TRACKERS: [string, string, string, string, Tracker['group']][] = [
  ['tr-regles', 'Règles', 'drop', '#C0395A', 'cycle'],
  ['tr-spm', 'SPM (prémenstruel)', 'moon', '#8E6BB0', 'cycle'],
  ['tr-maison', 'Journée à la maison', 'home', '#C7A0C9', 'maison'],
  ['tr-menage', 'Ménage', 'spray', '#8E6BB0', 'maison'],
  ['tr-lessive', 'Lessive', 'laundry', '#5B6FB5', 'maison'],
  ['tr-vaisselle', 'Vaisselle', 'droplets', '#3E9C9B', 'maison'],
  ['tr-rangement', 'Rangement', 'archive', '#9C8A96', 'maison'],
  ['tr-courses', 'Courses', 'shopping-basket', '#4E9A6A', 'maison'],
  ['tr-cuisine', 'Cuisine maison', 'pot', '#C98A4B', 'maison'],
  ['tr-douche', 'Douche', 'shower', '#5B6FB5', 'soin'],
  ['tr-skincare', 'Skincare', 'sparkles', '#E0789E', 'soin'],
  ['tr-cheveux', 'Soin des cheveux', 'scissors', '#D46A8C', 'soin'],
  ['tr-ongles', 'Ongles', 'gem', '#A83278', 'soin'],
  ['tr-bain', 'Bain', 'bath', '#C7A0C9', 'soin'],
  ['tr-lecture', 'Lecture', 'book', '#81265D', 'soin'],
  ['tr-meditation', 'Méditation', 'leaf', '#4E9A6A', 'soin'],
  ['tr-sieste', 'Sieste', 'bed', '#8E6BB0', 'soin'],
  ['tr-revisions', 'Révisions', 'brain', '#A83278', 'etudes'],
  ['tr-these', 'Préparation de la thèse', 'scroll', '#81265D', 'etudes'],
  ['tr-cours', 'Cours', 'graduation', '#5B6FB5', 'etudes'],
  ['tr-biblio', 'Bibliothèque', 'library', '#C98A4B', 'etudes'],
];

export const DEFAULT_PEOPLE = [
  'Léa', 'Yasmine', 'Alice', 'Rym', 'Antho', 'Roro', 'Nono', 'Rayou', 'Adri', 'Juju', 'Nico', 'Tom', 'Lyna', 'Shiraz', 'Maman', 'Nicola', 'Austin',
];
const slug = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-');

async function putSeed(table: TableName, recs: BaseRecord[]) {
  const t = db.table_(table);
  for (const r of recs) {
    if (await t.get(r.id)) continue;
    await t.put(r);
    await db.outbox.put({ key: `${table}/${r.id}`, table, id: r.id, updatedAt: r.updatedAt });
  }
}

export async function seedDefaults() {
  // Le journal est arrivé dans une mise à jour : ses suivis par défaut sont ajoutés une seule fois.
  if (!(await db.meta.get('seededTrackers'))) {
    await putSeed(
      'trackers',
      DEFAULT_TRACKERS.map(([id, name, icon, color, group], i) => seedRec<Tracker>({ id, name, icon, color, group, order: i })),
    );
    await db.meta.put({ key: 'seededTrackers', value: true });
  }
  if (!(await db.meta.get('seededTrackers2'))) {
    await putSeed(
      'trackers',
      MORE_TRACKERS.map(([id, name, icon, color, group], i) => seedRec<Tracker>({ id, name, icon, color, group, order: 100 + i })),
    );
    await db.meta.put({ key: 'seededTrackers2', value: true });
  }
  if (!(await db.meta.get('seededTrackers3'))) {
    await putSeed(
      'trackers',
      LIFE_TRACKERS.map(([id, name, icon, color, group], i) => seedRec<Tracker>({ id, name, icon, color, group, order: (group === 'sorties' ? 10 : 200) + i })),
    );
    await db.meta.put({ key: 'seededTrackers3', value: true });
  }
  if (!(await db.meta.get('seededPeople'))) {
    await putSeed(
      'contacts',
      DEFAULT_PEOPLE.map((name, i) =>
        seedRec<Contact>({ id: `pe-${slug(name)}`, name, kind: 'person', icon: name === 'Austin' ? 'paw' : name === 'Maman' ? 'heart' : 'users', color: COLORS[i % COLORS.length], order: i }),
      ),
    );
    await db.meta.put({ key: 'seededPeople', value: true });
  }
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
