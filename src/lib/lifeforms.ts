// Formulaires contextuels du journal : chaque activité n'affiche que les champs qui ont du sens.
import { db, remove, upsert } from '../db/db';
import type { Contact, DayItem, DayLog, Expense, ISODate, Tracker, TrackerForm } from '../db/types';

export interface FormSpec {
  label: string;
  people?: boolean;
  /** Propose « Seule » à côté des personnes. */
  alone?: boolean;
  places?: boolean;
  placesLabel?: string;
  amount?: boolean;
  /** Choix rapides (symptômes, type de sport, ressenti…). */
  tags?: { label: string; options: string[] };
  level?: { label: string; options: string[] };
  pain?: { label: string; options: string[] };
  comment: string;
}

const PMS_SYMPTOMS = ['Irritabilité', 'Tristesse', 'Anxiété', 'Fringales', 'Fatigue', 'Ballonnements', 'Seins sensibles', 'Acné', 'Insomnie', 'Maux de tête'];
const PERIOD_SYMPTOMS = ['Crampes', 'Mal au dos', 'Ballonnements', 'Fatigue', 'Maux de tête', 'Nausées', 'Seins sensibles', 'Acné'];

export const FORMS: Record<TrackerForm, FormSpec> = {
  outing: { label: 'Sortie (avec qui, où, dépense)', people: true, places: true, amount: true, comment: 'Un souvenir, une anecdote…' },
  cafe: { label: 'Café (avec qui ou seule, où)', people: true, alone: true, places: true, amount: true, comment: 'Commentaire' },
  travel: { label: 'Voyage (destination, avec qui, dépense)', people: true, alone: true, places: true, placesLabel: 'Destination', amount: true, comment: 'Ce que tu as aimé…' },
  work: { label: 'Travail (commentaire)', comment: 'Réunion, projet, ressenti…' },
  sport: {
    label: 'Sport (type, commentaire)',
    tags: { label: 'Type d’activité', options: ['Pilates', 'Yoga', 'Muscu', 'Cardio', 'Course', 'Marche', 'Danse', 'Natation', 'Vélo', 'Boxe'] },
    level: { label: 'Intensité', options: ['Douce', 'Moyenne', 'Intense'] },
    comment: 'Séance, ressenti…',
  },
  period: {
    label: 'Règles (flux, douleurs, symptômes)',
    level: { label: 'Flux', options: ['Léger', 'Moyen', 'Abondant'] },
    pain: { label: 'Douleurs', options: ['Aucune', 'Légères', 'Moyennes', 'Fortes'] },
    tags: { label: 'Symptômes', options: PERIOD_SYMPTOMS },
    comment: 'Commentaire',
  },
  pms: {
    label: 'Prémenstruel (symptômes, intensité)',
    tags: { label: 'Symptômes', options: PMS_SYMPTOMS },
    level: { label: 'Intensité', options: ['Légère', 'Moyenne', 'Forte'] },
    comment: 'Ressenti',
  },
  rest: {
    label: 'Repos (ressenti)',
    tags: { label: 'Ressenti', options: ['Reposée', 'Ressourcée', 'Cocooning', 'Encore fatiguée', 'Flemme assumée'] },
    comment: 'Commentaire',
  },
  spend: { label: 'Achat (dépense)', amount: true, comment: 'Commentaire' },
  social: { label: 'Famille, amis (avec qui, où)', people: true, places: true, comment: 'Commentaire' },
  sleep: {
    label: 'Sommeil (qualité)',
    level: { label: 'Ma nuit', options: ['Nuit blanche', 'Mal dormi', 'Correcte', 'Très bien dormi'] },
    tags: { label: 'Détails', options: ['Réveils', 'Insomnie', 'Cauchemars', 'Grasse mat’', 'Couchée tard', 'Sieste'] },
    comment: 'Commentaire',
  },
  health: {
    label: 'Rendez-vous santé (type, dépense)',
    tags: { label: 'Type', options: ['Généraliste', 'Gynéco', 'Dentiste', 'Dermato', 'Psy', 'Kiné', 'Ophtalmo', 'Prise de sang', 'Pharmacie'] },
    amount: true,
    comment: 'Ce qu’il faut retenir…',
  },
  sick: {
    label: 'Malade (symptômes, intensité)',
    tags: { label: 'Symptômes', options: ['Rhume', 'Mal de gorge', 'Fièvre', 'Migraine', 'Gastro', 'Toux', 'Allergie', 'Mal au ventre'] },
    level: { label: 'Intensité', options: ['Légère', 'Moyenne', 'Forte'] },
    comment: 'Commentaire',
  },
  simple: { label: 'Simple (commentaire)', comment: 'Commentaire (facultatif)' },
};

/** Formulaire par défaut des activités livrées avec l'application. */
const DEFAULT_FORM: Record<string, TrackerForm> = {
  'tr-cafe': 'cafe',
  'tr-apero': 'outing',
  'tr-verre': 'outing',
  'tr-diner': 'outing',
  'tr-soiree': 'outing',
  'tr-cinema': 'outing',
  'tr-derive': 'simple',
  'tr-alcool': 'simple',
  'tr-sport': 'sport',
  'tr-bureau': 'work',
  'tr-teletravail': 'work',
  'tr-conge': 'rest',
  'tr-voyage': 'travel',
  'tr-maison': 'rest',
  'tr-sieste': 'rest',
  'tr-courses': 'spend',
  'tr-regles': 'period',
  'tr-spm': 'pms',
  'tr-brunch': 'outing',
  'tr-boite': 'outing',
  'tr-concert': 'outing',
  'tr-expo': 'outing',
  'tr-shopping': 'outing',
  'tr-date': 'outing',
  'tr-couple': 'outing',
  'tr-match': 'simple',
  'tr-crush': 'simple',
  'tr-ex': 'simple',
  'tr-famille': 'social',
  'tr-appel': 'social',
  'tr-recevoir': 'social',
  'tr-anniv': 'outing',
  'tr-medecin': 'health',
  'tr-malade': 'sick',
  'tr-craquage': 'spend',
  'tr-entretien': 'work',
  'tr-side': 'work',
};

export function formOf(t: Pick<Tracker, 'id' | 'group' | 'form'>): TrackerForm {
  return t.form || DEFAULT_FORM[t.id] || (t.group === 'sorties' ? 'outing' : 'simple');
}

/** Catégorie budget où ranger une dépense saisie depuis le journal. */
export function budgetCategoryFor(t: Pick<Tracker, 'id' | 'group' | 'form'>): string {
  if (t.id === 'tr-diner') return 'bc-restaurants';
  if (t.id === 'tr-courses') return 'bc-courses';
  if (t.id === 'tr-shopping' || t.id === 'tr-craquage') return 'bc-shopping';
  if (t.id === 'tr-medecin') return 'bc-sport';
  const f = formOf(t);
  if (f === 'travel') return 'bc-voyages';
  if (f === 'outing' || f === 'cafe') return 'bc-sorties';
  return 'bc-autres';
}

export const journalExpenseId = (date: ISODate, trackerId: string) => `jx-${date}-${trackerId}`;

/**
 * Enregistre (ou retire) la dépense liée à une activité du journal. Une seule dépense par activité et par jour :
 * l'identifiant est déterministe, donc aucun doublon, même en synchronisant plusieurs appareils.
 */
export async function setJournalExpense(date: ISODate, t: Tracker, amount: number | undefined, item: DayItem | undefined, contacts: Contact[]) {
  const id = journalExpenseId(date, t.id);
  const cur = await db.expenses.get(id);
  if (!amount || amount <= 0) {
    if (cur && !cur.deleted) await remove('expenses', id);
    return;
  }
  const names = new Map(contacts.map((c) => [c.id, c.name]));
  const who = [...(item?.people || []), ...(item?.places || [])].map((x) => names.get(x)).filter(Boolean);
  const note = [t.name, who.join(', ')].filter(Boolean).join(' · ');
  // On garde la catégorie choisie si elle a été changée depuis le budget.
  const budgetCategoryId = cur && !cur.deleted && cur.budgetCategoryId ? cur.budgetCategoryId : budgetCategoryFor(t);
  await upsert<Expense>('expenses', { id, amount, date, note, budgetCategoryId, journal: { date, trackerId: t.id } });
}

/** États du jour : plusieurs par jour, avec une intensité (toucher à nouveau pour l'augmenter), rangés par famille. */
export const FEELING_GROUPS: { id: string; label: string }[] = [
  { id: 'body', label: 'Corps' },
  { id: 'energy', label: 'Énergie' },
  { id: 'mind', label: 'Tête' },
  { id: 'heart', label: 'Cœur' },
  { id: 'vibes', label: 'Vibes' },
  { id: 'low', label: 'Moins bien' },
];
export const FEELINGS: { id: string; label: string; color: string; group: string }[] = [
  { id: 'hendaye', label: 'HENDAYE', color: '#81265D', group: 'body' },
  { id: 'sick', label: 'sick', color: '#3E9C9B', group: 'body' },
  { id: 'bloated', label: 'bloated', color: '#C7A0C9', group: 'body' },
  { id: 'sore', label: 'sore', color: '#9C8A96', group: 'body' },
  { id: 'pretty', label: 'feeling pretty', color: '#E0789E', group: 'body' },
  { id: 'energized', label: 'energized', color: '#C9A13B', group: 'energy' },
  { id: 'tired', label: 'tired', color: '#9C8A96', group: 'energy' },
  { id: 'drained', label: 'drained', color: '#5B6FB5', group: 'energy' },
  { id: 'lazy', label: 'lazy girl day', color: '#C7A0C9', group: 'energy' },
  { id: 'focused', label: 'focused', color: '#81265D', group: 'mind' },
  { id: 'productive', label: 'productive', color: '#81265D', group: 'mind' },
  { id: 'motivated', label: 'motivated', color: '#A83278', group: 'mind' },
  { id: 'inspired', label: 'inspired', color: '#E0789E', group: 'mind' },
  { id: 'foggy', label: 'brain fog', color: '#9C8A96', group: 'mind' },
  { id: 'overwhelmed', label: 'overwhelmed', color: '#C9A13B', group: 'mind' },
  { id: 'stressed', label: 'stressed', color: '#C9A13B', group: 'mind' },
  { id: 'in-love', label: 'in love', color: '#E0457B', group: 'heart' },
  { id: 'butterflies', label: 'butterflies', color: '#E0789E', group: 'heart' },
  { id: 'loved', label: 'loved', color: '#D46A8C', group: 'heart' },
  { id: 'missing', label: 'missing someone', color: '#8E6BB0', group: 'heart' },
  { id: 'heartbroken', label: 'heartbroken', color: '#5B6FB5', group: 'heart' },
  { id: 'jealous', label: 'jealous', color: '#4E9A6A', group: 'heart' },
  { id: 'confident', label: 'confident', color: '#A83278', group: 'vibes' },
  { id: 'social', label: 'social butterfly', color: '#D46A8C', group: 'vibes' },
  { id: 'cozy', label: 'cozy', color: '#C98A4B', group: 'vibes' },
  { id: 'peaceful', label: 'peaceful', color: '#4E9A6A', group: 'vibes' },
  { id: 'grateful', label: 'grateful', color: '#D46A8C', group: 'vibes' },
  { id: 'nostalgic', label: 'nostalgic', color: '#8E6BB0', group: 'vibes' },
  { id: 'free', label: 'free', color: '#3E9C9B', group: 'vibes' },
  { id: 'sad', label: 'sad', color: '#5B6FB5', group: 'low' },
  { id: 'anxious', label: 'anxious', color: '#8E6BB0', group: 'low' },
  { id: 'irritated', label: 'irritated', color: '#C0395A', group: 'low' },
  { id: 'lonely', label: 'lonely', color: '#9C8A96', group: 'low' },
  { id: 'emotional', label: 'emotional', color: '#C7A0C9', group: 'low' },
  { id: 'insecure', label: 'insecure', color: '#9C8A96', group: 'low' },
  { id: 'bored', label: 'bored', color: '#9C8A96', group: 'low' },
];
export const FEELING_BY_ID = new Map(FEELINGS.map((f) => [f.id, f]));

/** Montée de version des données du journal, sans rien supprimer de ce que tu as saisi. */
export async function migrateJournal() {
  if (await db.meta.get('mig-journal-v4')) return;
  // « Hendaye » devient un état du jour (avec les autres humeurs) au lieu d'une activité.
  const h = await db.trackers.get('tr-hendaye');
  if (h && !h.deleted) {
    const logs = await db.daylogs.toArray();
    for (const l of logs) {
      if (l.deleted || !l.items.some((i) => i.trackerId === 'tr-hendaye')) continue;
      const feelings = l.feelings || [];
      await upsert<DayLog>('daylogs', {
        ...l,
        items: l.items.filter((i) => i.trackerId !== 'tr-hendaye'),
        feelings: feelings.some((f) => f.id === 'hendaye') ? feelings : [...feelings, { id: 'hendaye', level: 2 }],
      });
    }
    await remove('trackers', 'tr-hendaye');
  }
  // « Dîner » devient « Resto / dîner » (seulement si tu ne l'avais pas renommé).
  const d = await db.trackers.get('tr-diner');
  if (d && !d.deleted && d.name === 'Dîner') await upsert<Tracker>('trackers', { ...d, name: 'Resto / dîner' });
  await db.meta.put({ key: 'mig-journal-v4', value: true });
}
