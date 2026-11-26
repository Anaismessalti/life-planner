import type { DayLog, ISOMonth, Tracker } from '../db/types';
import { monthEnd, monthStart } from './dates';

export const MOODS = [
  { value: 1, label: 'Difficile', emoji: '😣', color: '#9C8A96' },
  { value: 2, label: 'Bof', emoji: '😕', color: '#C7A0C9' },
  { value: 3, label: 'Correcte', emoji: '🙂', color: '#E0A3C4' },
  { value: 4, label: 'Belle', emoji: '😊', color: '#D46A8C' },
  { value: 5, label: 'Géniale', emoji: '🤩', color: '#A83278' },
];

export const GROUP_LABEL: Record<Tracker['group'], string> = {
  sorties: 'Sorties',
  moi: 'Moi',
  travail: 'Travail et voyages',
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
}

export function monthJournal(logs: DayLog[], trackers: Tracker[], month: ISOMonth): MonthJournal {
  const from = monthStart(month);
  const to = monthEnd(month);
  const inMonth = logs.filter((l) => !l.deleted && l.date >= from && l.date <= to);
  const live = trackers.filter((t) => !t.deleted);
  const byId = new Map(live.map((t) => [t.id, t]));
  const moods = inMonth.map((l) => l.mood).filter((m): m is number => typeof m === 'number');
  const perGroup: Record<Tracker['group'], number> = { sorties: 0, moi: 0, travail: 0, autres: 0 };
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
      counts.set(t.id, c);
    }
    groups.forEach((g) => perGroup[g]++);
  }
  const loggedDays = inMonth.filter((l) => l.items.length || l.mood || l.text);
  return {
    daysLogged: loggedDays.length,
    moodAvg: moods.length ? Math.round((moods.reduce((a, b) => a + b, 0) / moods.length) * 10) / 10 : undefined,
    perTracker: live
      .map((t) => ({ tracker: t, days: counts.get(t.id)?.days.size || 0, details: counts.get(t.id)?.details || [] }))
      .sort((a, b) => b.days - a.days || a.tracker.order - b.tracker.order),
    perGroup,
    bestDays: inMonth.filter((l) => l.mood === 5).map((l) => l.date).sort(),
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
