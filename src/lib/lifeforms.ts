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
};

export function formOf(t: Pick<Tracker, 'id' | 'group' | 'form'>): TrackerForm {
  return t.form || DEFAULT_FORM[t.id] || (t.group === 'sorties' ? 'outing' : 'simple');
}

/** Catégorie budget où ranger une dépense saisie depuis le journal. */
export function budgetCategoryFor(t: Pick<Tracker, 'id' | 'group' | 'form'>): string {
  if (t.id === 'tr-diner') return 'bc-restaurants';
  if (t.id === 'tr-courses') return 'bc-courses';
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

/** États du jour : plusieurs par jour, avec une intensité (toucher à nouveau pour l'augmenter). */
export const FEELINGS: { id: string; label: string; color: string }[] = [
  { id: 'hendaye', label: 'HENDAYE', color: '#81265D' },
  { id: 'tired', label: 'tired', color: '#9C8A96' },
  { id: 'stressed', label: 'stressed', color: '#C9A13B' },
  { id: 'anxious', label: 'anxious', color: '#8E6BB0' },
  { id: 'sad', label: 'sad', color: '#5B6FB5' },
  { id: 'irritated', label: 'irritated', color: '#C0395A' },
  { id: 'sick', label: 'sick', color: '#3E9C9B' },
  { id: 'lonely', label: 'lonely', color: '#9C8A96' },
  { id: 'emotional', label: 'emotional', color: '#C7A0C9' },
  { id: 'cozy', label: 'cozy', color: '#C98A4B' },
  { id: 'peaceful', label: 'peaceful', color: '#4E9A6A' },
  { id: 'grateful', label: 'grateful', color: '#D46A8C' },
  { id: 'motivated', label: 'motivated', color: '#A83278' },
  { id: 'productive', label: 'productive', color: '#81265D' },
  { id: 'confident', label: 'confident', color: '#A83278' },
  { id: 'inspired', label: 'inspired', color: '#E0789E' },
  { id: 'in-love', label: 'in love', color: '#E0457B' },
  { id: 'social', label: 'social butterfly', color: '#D46A8C' },
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
