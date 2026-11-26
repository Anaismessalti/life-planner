// Passerelles entre l'agenda et le journal : un rendez-vous « Dîner avec Léa » devient, en un geste, une sortie du journal.
import type { Contact, DayItem, Task, Tracker } from '../db/types';

const norm = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();

/** Mot-clé (sans accent) → activité du journal. Le premier qui correspond gagne. */
const RULES: [RegExp, string][] = [
  [/\b(rencard|date|tinder|hinge|bumble)\b/, 'tr-date'],
  [/\b(medecin|docteur|dentiste|gyneco|gynecologue|dermato|psy|kine|ophtalmo|prise de sang|osteo|sage-femme)\b/, 'tr-medecin'],
  [/\b(entretien|interview)\b/, 'tr-entretien'],
  [/\b(anniv|anniversaire|birthday)\b/, 'tr-anniv'],
  [/\bbrunch\b/, 'tr-brunch'],
  [/\b(apero|aperitif|afterwork|after work)\b/, 'tr-apero'],
  [/\b(verre|bar)\b/, 'tr-verre'],
  [/\b(diner|dej|dejeuner|resto|restaurant)\b/, 'tr-diner'],
  [/\b(soiree|fete|party)\b/, 'tr-soiree'],
  [/\b(boite|club|clubbing)\b/, 'tr-boite'],
  [/\b(concert|festival)\b/, 'tr-concert'],
  [/\b(expo|exposition|musee)\b/, 'tr-expo'],
  [/\b(cine|cinema|film)\b/, 'tr-cinema'],
  [/\b(cafe|coffee|matcha)\b/, 'tr-cafe'],
  [/\b(sport|pilates|yoga|muscu|salle|gym|running|course a pied|natation|piscine|boxe|danse)\b/, 'tr-sport'],
  [/\b(shopping)\b/, 'tr-shopping'],
  [/\b(famille|maman|papa|parents|mamie|papi)\b/, 'tr-famille'],
  [/\b(manucure|ongles|onglerie)\b/, 'tr-ongles'],
  [/\b(coiffeur|coiffure|cheveux|brushing)\b/, 'tr-cheveux'],
  [/\b(cours|td|seminaire)\b/, 'tr-cours'],
  [/\b(bibliotheque|bu|biblio)\b/, 'tr-biblio'],
  [/\b(these|directeur de these|soutenance)\b/, 'tr-these'],
  [/\b(voyage|vol|train|aeroport|weekend a|week-end a)\b/, 'tr-voyage'],
];

export interface Suggestion {
  task: Task;
  tracker: Tracker;
  item: DayItem;
}

/** Associe un rendez-vous à une activité du journal, avec les proches et lieux reconnus dans son titre ou son lieu. */
export function suggestFromEvent(task: Task, trackers: Tracker[], contacts: Contact[]): Suggestion | undefined {
  const text = norm(`${task.title} ${task.location || ''}`);
  const live = new Map(trackers.filter((t) => !t.deleted).map((t) => [t.id, t]));
  let tracker: Tracker | undefined;
  for (const [re, id] of RULES) {
    if (re.test(text) && live.has(id)) {
      tracker = live.get(id);
      break;
    }
  }
  if (!tracker) {
    // Nom d'une activité personnalisée écrit tel quel dans le titre.
    tracker = [...live.values()].find((t) => t.name.length >= 4 && new RegExp(`(?:^|[^a-z0-9])${escape(norm(t.name))}(?=$|[^a-z0-9])`).test(text));
  }
  if (!tracker) return undefined;
  const found = (kind: Contact['kind']) =>
    contacts
      .filter((c) => !c.deleted && c.kind === kind && c.name.trim().length >= 2)
      .filter((c) => new RegExp(`(?:^|[^a-z0-9])${escape(norm(c.name.trim()))}(?=$|[^a-z0-9])`).test(text))
      .map((c) => c.id);
  const people = found('person');
  const places = found('place');
  const item: DayItem = { trackerId: tracker.id };
  if (people.length) item.people = people;
  if (places.length) item.places = places;
  if (!people.length && !places.length) item.detail = task.title;
  return { task, tracker, item };
}

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Ajoute (ou complète) l'activité d'un jour sans jamais effacer ce qui y est déjà. */
export function mergeItem(items: DayItem[], add: DayItem): DayItem[] {
  const cur = items.find((i) => i.trackerId === add.trackerId);
  if (!cur) return [...items, add];
  const uniq = (a?: string[], b?: string[]) => {
    const u = [...new Set([...(a || []), ...(b || [])])];
    return u.length ? u : undefined;
  };
  return items.map((i) =>
    i.trackerId === add.trackerId ? { ...i, people: uniq(i.people, add.people), places: uniq(i.places, add.places), detail: i.detail || add.detail } : i,
  );
}

/** Habitudes cochables depuis Aujourd'hui : activités du journal choisies dans Paramètres. */
export const DEFAULT_HABITS = ['tr-skincare', 'tr-sport', 'tr-eau', 'tr-lecture', 'tr-meditation'];
