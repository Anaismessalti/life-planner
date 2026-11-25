import type { Frequency, ISODate, Recurrence } from '../db/types';
import { addDays, daysInMonth, diffDays, fromISO, toISO, weekStart, weekday } from './dates';

/** Date du mois `y/m0` avec le jour `day`, ramené au dernier jour si le mois est plus court (31 → 30, 29 fév. → 28). */
function clampDay(y: number, m0: number, day: number): ISODate {
  const d = new Date(y, m0, Math.min(day, daysInMonth(y, m0)), 12);
  return toISO(d);
}

/**
 * Toutes les occurrences d'une récurrence entre `from` et `to` (inclus).
 * Fonction pure et déterministe : la même série donne toujours les mêmes dates,
 * ce qui permet d'identifier chaque occurrence sans jamais créer de doublon.
 */
export function occurrences(start: ISODate, rec: Recurrence, from: ISODate, to: ISODate): ISODate[] {
  const out: ISODate[] = [];
  const interval = Math.max(1, Math.floor(rec.interval || 1));
  const end = rec.until && rec.until < to ? rec.until : to;
  if (end < start || end < from) return out;
  const lo = from > start ? from : start;

  switch (rec.freq) {
    case 'daily': {
      const offset = diffDays(lo, start);
      const k = Math.ceil(offset / interval);
      for (let d = addDays(start, k * interval); d <= end; d = addDays(d, interval)) out.push(d);
      break;
    }
    case 'weekly': {
      const days = rec.byWeekday && rec.byWeekday.length ? rec.byWeekday : [weekday(start)];
      const ws0 = weekStart(start);
      for (let d = lo; d <= end; d = addDays(d, 1)) {
        const weekIdx = Math.round(diffDays(weekStart(d), ws0) / 7);
        if (weekIdx % interval === 0 && days.includes(weekday(d))) out.push(d);
      }
      break;
    }
    case 'monthly': {
      const s = fromISO(start);
      const day = s.getDate();
      const l = fromISO(lo);
      let months = (l.getFullYear() - s.getFullYear()) * 12 + (l.getMonth() - s.getMonth());
      months = Math.max(0, Math.floor(months / interval) * interval - interval);
      for (; ; months += interval) {
        const d = clampDay(s.getFullYear(), s.getMonth() + months, day);
        // clampDay avec un mois > 11 : Date gère le débordement d'année
        if (d > end) break;
        if (d >= lo) out.push(d);
      }
      break;
    }
    case 'yearly': {
      const s = fromISO(start);
      const l = fromISO(lo);
      let years = Math.max(0, Math.floor((l.getFullYear() - s.getFullYear()) / interval) * interval - interval);
      for (; ; years += interval) {
        const d = clampDay(s.getFullYear() + years, s.getMonth(), s.getDate());
        if (d > end) break;
        if (d >= lo) out.push(d);
      }
      break;
    }
  }
  return out;
}

/** Prochaine occurrence strictement après `after`. */
export function nextOccurrence(start: ISODate, rec: Recurrence, after: ISODate): ISODate | undefined {
  const horizon = addDays(after, 800);
  return occurrences(start, rec, addDays(after, 1), horizon)[0];
}

/** Convertit une fréquence financière en récurrence. */
export function freqToRecurrence(f: Frequency): Recurrence | undefined {
  switch (f) {
    case 'weekly':
      return { freq: 'weekly', interval: 1 };
    case 'monthly':
      return { freq: 'monthly', interval: 1 };
    case 'quarterly':
      return { freq: 'monthly', interval: 3 };
    case 'yearly':
      return { freq: 'yearly', interval: 1 };
    default:
      return undefined;
  }
}

export function financeOccurrences(item: { date: ISODate; frequency: Frequency; endDate?: ISODate }, from: ISODate, to: ISODate) {
  const rec = freqToRecurrence(item.frequency);
  if (!rec) return item.date >= from && item.date <= to ? [item.date] : [];
  return occurrences(item.date, { ...rec, until: item.endDate }, from, to);
}

const WD = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
export function describeRecurrence(r: Recurrence): string {
  const n = r.interval || 1;
  switch (r.freq) {
    case 'daily':
      return n === 1 ? 'Tous les jours' : `Tous les ${n} jours`;
    case 'weekly': {
      const days = (r.byWeekday || []).map((d) => WD[d]).join(', ');
      const base = n === 1 ? 'Chaque semaine' : `Toutes les ${n} semaines`;
      return days ? `${base} (${days})` : base;
    }
    case 'monthly':
      return n === 1 ? 'Chaque mois' : `Tous les ${n} mois`;
    case 'yearly':
      return n === 1 ? 'Chaque année' : `Tous les ${n} ans`;
  }
}
export const FREQ_LABEL: Record<Frequency, string> = {
  once: 'Une fois',
  weekly: 'Chaque semaine',
  monthly: 'Chaque mois',
  quarterly: 'Chaque trimestre',
  yearly: 'Chaque année',
};
