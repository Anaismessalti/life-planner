import type { Contact, DayLog, ISOMonth, Tracker } from '../db/types';
import { monthEnd, monthStart } from './dates';

/** Humeurs : des mots doux en anglais et une couleur, sans émoji. */
export const MOODS = [
  { value: 1, label: 'rough', color: '#9C8A96', line: 'heavy skies, be gentle with yourself' },
  { value: 2, label: 'meh', color: '#C7A0C9', line: 'a little grey around the edges' },
  { value: 3, label: 'okay', color: '#E0A3C4', line: 'soft and steady' },
  { value: 4, label: 'glowing', color: '#D46A8C', line: 'warm from the inside' },
  { value: 5, label: 'magic', color: '#A83278', line: 'pure stardust' },
];

/** « a glowing day », « an okay week » : l'article anglais juste. */
export const moodWord = (label: string, what: 'day' | 'week' | 'month') => `${/^[aeiou]/i.test(label) ? 'an' : 'a'} ${label} ${what}`;

export const GROUP_ORDER: Tracker['group'][] = ['sorties', 'amour', 'social', 'moi', 'cycle', 'sante', 'soin', 'maison', 'travail', 'etudes', 'autres'];

export const GROUP_LABEL: Record<Tracker['group'], string> = {
  sorties: 'Sorties',
  amour: 'Love life',
  social: 'Famille et amis',
  moi: 'Moi',
  cycle: 'Mon cycle',
  sante: 'Santé',
  soin: 'Self-care',
  maison: 'À la maison',
  travail: 'Travail et voyages',
  etudes: 'Études',
  autres: 'Autres',
};

export interface MonthJournal {
  daysLogged: number;
  moodAvg?: number;
  /** Nombre de jours (et non d'activités) par suivi. */
  perTracker: { tracker: Tracker; days: number; details: string[] }[];
  /** Jours avec au moins une activité du groupe. */
  perGroup: Record<Tracker['group'], number>;
  bestDays: string[];
  /** Nombre de jours passés avec chaque personne / dans chaque lieu, du plus fréquent au moins fréquent. */
  perContact: { contact: Contact; days: number }[];
}

export function monthJournal(logs: DayLog[], trackers: Tracker[], month: ISOMonth, contacts: Contact[] = []): MonthJournal {
  const from = monthStart(month);
  const to = monthEnd(month);
  const inMonth = logs.filter((l) => !l.deleted && l.date >= from && l.date <= to);
  const live = trackers.filter((t) => !t.deleted);
  const byId = new Map(live.map((t) => [t.id, t]));
  const moods = inMonth.map((l) => l.mood).filter((m): m is number => typeof m === 'number');
  const perGroup: Record<Tracker['group'], number> = { sorties: 0, amour: 0, social: 0, moi: 0, cycle: 0, sante: 0, soin: 0, maison: 0, travail: 0, etudes: 0, autres: 0 };
  const cname = new Map(contacts.map((c) => [c.id, c.name]));
  const counts = new Map<string, { days: Set<string>; details: string[] }>();
  for (const l of inMonth) {
    const groups = new Set<Tracker['group']>();
    for (const it of l.items) {
      const t = byId.get(it.trackerId);
      if (!t) continue;
      groups.add(t.group);
      const c = counts.get(t.id) || { days: new Set(), details: [] };
      c.days.add(l.date);
      if (it.detail) c.details.push(it.detail);
      for (const id of [...(it.people || []), ...(it.places || [])]) if (cname.has(id)) c.details.push(cname.get(id)!);
      counts.set(t.id, c);
    }
    groups.forEach((g) => perGroup[g]++);
  }
  const contactDays = new Map<string, Set<string>>();
  for (const l of inMonth)
    for (const it of l.items)
      for (const id of [...(it.people || []), ...(it.places || [])]) {
        const set = contactDays.get(id) || new Set<string>();
        set.add(l.date);
        contactDays.set(id, set);
      }
  const perContact = contacts
    .filter((c) => !c.deleted && contactDays.has(c.id))
    .map((c) => ({ contact: c, days: contactDays.get(c.id)!.size }))
    .sort((a, b) => b.days - a.days || a.contact.order - b.contact.order);
  const loggedDays = inMonth.filter((l) => l.items.length || l.mood || l.text);
  return {
    daysLogged: loggedDays.length,
    moodAvg: moods.length ? Math.round((moods.reduce((a, b) => a + b, 0) / moods.length) * 10) / 10 : undefined,
    perTracker: live
      .map((t) => ({ tracker: t, days: counts.get(t.id)?.days.size || 0, details: counts.get(t.id)?.details || [] }))
      .sort((a, b) => b.days - a.days || a.tracker.order - b.tracker.order),
    perGroup,
    bestDays: inMonth.filter((l) => l.mood === 5).map((l) => l.date).sort(),
    perContact,
  };
}

/** Les personnes / lieux qui reviennent le plus souvent dans les détails (« avec Léa »). */
export function topDetails(details: string[], n = 3) {
  const m = new Map<string, number>();
  for (const d of details) {
    const k = d.trim().replace(/^(avec|chez|à|au)\s+/i, '');
    if (k) m.set(k, (m.get(k) || 0) + 1);
  }
  return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, n);
}
