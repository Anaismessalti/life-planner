import { format, parseISO } from 'date-fns';
import { fr } from 'date-fns/locale';
import type { ISODate, ISOMonth } from '../db/types';

const pad = (n: number) => String(n).padStart(2, '0');

/** Date locale au format YYYY-MM-DD (jamais en UTC, pour éviter les décalages à minuit). */
export function toISO(d: Date): ISODate {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
export function fromISO(s: ISODate): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d, 12, 0, 0); // midi : insensible aux changements d'heure
}
export function todayISO(): ISODate {
  return toISO(new Date());
}
export function addDays(s: ISODate, n: number): ISODate {
  const d = fromISO(s);
  d.setDate(d.getDate() + n);
  return toISO(d);
}
export function diffDays(a: ISODate, b: ISODate): number {
  return Math.round((fromISO(a).getTime() - fromISO(b).getTime()) / 86400000);
}
export function monthOf(s: ISODate): ISOMonth {
  return s.slice(0, 7);
}
export function addMonths(m: ISOMonth, n: number): ISOMonth {
  const [y, mo] = m.split('-').map(Number);
  const d = new Date(y, mo - 1 + n, 1);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
}
export function daysInMonth(y: number, m0: number) {
  return new Date(y, m0 + 1, 0).getDate();
}
export function monthStart(m: ISOMonth): ISODate {
  return `${m}-01`;
}
export function monthEnd(m: ISOMonth): ISODate {
  const [y, mo] = m.split('-').map(Number);
  return `${m}-${pad(daysInMonth(y, mo - 1))}`;
}
/** Lundi de la semaine contenant la date. */
export function weekStart(s: ISODate): ISODate {
  const d = fromISO(s);
  const wd = (d.getDay() + 6) % 7;
  return addDays(s, -wd);
}
export function range(start: ISODate, end: ISODate): ISODate[] {
  const out: ISODate[] = [];
  for (let d = start; d <= end; d = addDays(d, 1)) out.push(d);
  return out;
}
export function weekday(s: ISODate) {
  return fromISO(s).getDay();
}

export const isISODate = (s: unknown): s is ISODate => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && toISO(fromISO(s)) === s;
export const isISOMonth = (s: unknown): s is ISOMonth => typeof s === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(s);

/** Formatage tolérant : une date invalide ne fait jamais planter l'écran. */
export function fmt(s: ISODate, pattern: string) {
  if (!isISODate(s)) return '';
  return format(fromISO(s), pattern, { locale: fr });
}
export function fmtMonth(m: ISOMonth) {
  if (!isISOMonth(m)) return '';
  const s = format(parseISO(`${m}-01`), 'LLLL yyyy', { locale: fr });
  return s.charAt(0).toUpperCase() + s.slice(1);
}
export function capitalize(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
export function relativeDay(s: ISODate, today = todayISO()) {
  const d = diffDays(s, today);
  if (d === 0) return "Aujourd'hui";
  if (d === 1) return 'Demain';
  if (d === -1) return 'Hier';
  return capitalize(fmt(s, 'EEE d MMM'));
}
export function timeToMin(t: string) {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + (m || 0);
}
export function minToTime(min: number) {
  return `${pad(Math.floor(min / 60) % 24)}:${pad(min % 60)}`;
}

export const WEEKDAYS_SHORT = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];
