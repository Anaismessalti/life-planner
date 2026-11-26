// Passerelles entre l'agenda et le journal : un rendez-vous « Dîner avec Léa » devient, en un geste, une sortie du journal.
import type { Contact, DayItem, DayLog, Task, Tracker } from '../db/types';

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

/** Habitudes : des activités du journal avec un objectif réaliste par semaine (jamais de série à perdre). */
export type HabitSetting = string | { id: string; perWeek: number };
export const DEFAULT_HABITS: HabitSetting[] = [
  { id: 'tr-skincare', perWeek: 5 },
  { id: 'tr-sport', perWeek: 3 },
  { id: 'tr-lecture', perWeek: 3 },
];

/**
 * Une seule fois : retire Méditation des habitudes de la semaine (demande d'Anaïs, 26/11/2026).
 * Le suivi « Méditation » et tout l'historique du journal restent intacts ; on peut la remettre avec le crayon.
 */
export async function dropMeditationHabit() {
  const { db, setSetting } = await import('../db/db');
  if (await db.meta.get('mig-habits-no-meditation')) return;
  const r = await db.settings.get('habits');
  if (r && !r.deleted && Array.isArray(r.value)) {
    const kept = (r.value as unknown[]).filter((h) => (typeof h === 'string' ? h : (h as any)?.id) !== 'tr-meditation');
    if (kept.length !== r.value.length) await setSetting('habits', kept);
  }
  await db.meta.put({ key: 'mig-habits-no-meditation', value: true });
}
export const MAX_HABITS = 5;
/** Ce qu'on ne coche pas comme une réussite (états, écarts, cycle). */
export const NOT_HABITS = new Set(['tr-pilule', 'tr-scroll', 'tr-craquage', 'tr-derive', 'tr-ex', 'tr-malade', 'tr-regles', 'tr-spm', 'tr-alcool', 'tr-match', 'tr-crush', 'tr-conge']);

export function normalizeHabits(raw: unknown): { id: string; perWeek: number }[] {
  if (!Array.isArray(raw)) return [];
  const out: { id: string; perWeek: number }[] = [];
  for (const h of raw) {
    const id = typeof h === 'string' ? h : h && typeof h === 'object' && typeof (h as any).id === 'string' ? (h as any).id : undefined;
    if (!id || out.some((x) => x.id === id)) continue;
    const n = typeof h === 'object' ? Number((h as any).perWeek) : 3;
    out.push({ id, perWeek: Number.isFinite(n) ? Math.max(1, Math.min(7, Math.round(n))) : 3 });
  }
  return out;
}

export type DayState = 'done' | 'logged' | 'empty' | 'soft' | 'future';
export interface HabitWeek {
  tracker: Tracker;
  perWeek: number;
  /** Objectif de la semaine, allégé par les journées douces. */
  target: number;
  done: number;
  days: { date: string; state: DayState }[];
  /** Pas faite depuis au moins 7 jours (et déjà faite avant) : on propose une reprise en douceur. */
  comeback: boolean;
}

/**
 * Trois états bien distincts par jour : fait, jour renseigné sans l'habitude, jour non renseigné.
 * Une journée douce allège l'objectif de la semaine au prorata.
 */
export function weekStatus(habits: { id: string; perWeek: number }[], byDate: Map<string, DayLog>, today: string, trackers: Tracker[]): HabitWeek[] {
  const start = weekStartISO(today);
  const dates = Array.from({ length: 7 }, (_, i) => addDaysISO(start, i));
  const softDays = dates.filter((d) => byDate.get(d)?.soft).length;
  const out: HabitWeek[] = [];
  for (const h of habits) {
    const tracker = trackers.find((t) => t.id === h.id && !t.deleted);
    if (!tracker) continue;
    const has = (d: string) => !!byDate.get(d)?.items.some((i) => i.trackerId === h.id);
    const days = dates.map((date) => {
      const l = byDate.get(date);
      const state: DayState = has(date) ? 'done' : date > today ? 'future' : l?.soft ? 'soft' : l && isLoggedDay(l) ? 'logged' : date === today ? 'future' : 'empty';
      return { date, state };
    });
    let last: string | undefined;
    for (const [d, l] of byDate) if (d <= today && l.items.some((i) => i.trackerId === h.id) && (!last || d > last)) last = d;
    const target = Math.max(1, Math.ceil((h.perWeek * (7 - softDays)) / 7));
    out.push({
      tracker,
      perWeek: h.perWeek,
      target,
      done: days.filter((d) => d.state === 'done').length,
      days,
      comeback: !!last && last < addDaysISO(today, -7) && !days.some((d) => d.state === 'done'),
    });
  }
  return out;
}

const isLoggedDay = (l: DayLog) => l.items.length > 0 || (typeof l.mood === 'number' && l.mood >= 1) || (l.feelings?.length || 0) > 0 || !!l.text?.trim() || typeof l.score === 'number';
function addDaysISO(s: string, n: number) {
  const d = new Date(`${s}T12:00:00`);
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function weekStartISO(s: string) {
  const d = new Date(`${s}T12:00:00`);
  return addDaysISO(s, -((d.getDay() + 6) % 7));
}
