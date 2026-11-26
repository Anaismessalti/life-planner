// Sommeil et Five Minute Journal : petites fonctions pures (testées) utilisées par le journal et les stats.
import type { DayLog, DaySleep, FiveMinute } from '../db/types';

export const SLEEP_QUALITY = [
  { value: 1, label: 'rough night', color: '#9C8A96' },
  { value: 2, label: 'light sleep', color: '#C7A0C9' },
  { value: 3, label: 'rested', color: '#D46A8C' },
  { value: 4, label: 'beauty sleep', color: '#A83278' },
];
export const SLEEP_TAGS = ['Réveils la nuit', 'Insomnie', 'Cauchemars', 'Beaux rêves', 'Grasse mat’', 'Sieste', 'Écran tard', 'Couchée après une soirée'];

const HHMM = /^([01]\d|2[0-3]):([0-5]\d)$/;
export const isHHmm = (s: unknown): s is string => typeof s === 'string' && HHMM.test(s);
const toMin = (s: string) => Number(s.slice(0, 2)) * 60 + Number(s.slice(3, 5));

/** Durée de la nuit en minutes : coucher la veille (ou après minuit), réveil le matin. */
export function sleepMinutes(s?: DaySleep): number | undefined {
  if (!s || !isHHmm(s.bed) || !isHHmm(s.wake)) return undefined;
  let d = toMin(s.wake) - toMin(s.bed);
  if (d <= 0) d += 24 * 60;
  return d > 0 && d <= 18 * 60 ? d : undefined;
}

export function fmtDuration(min?: number) {
  if (min === undefined || !isFinite(min)) return '–';
  const m = Math.round(min);
  const h = Math.floor(m / 60);
  const r = m % 60;
  return r ? `${h} h ${String(r).padStart(2, '0')}` : `${h} h`;
}

/** Heure de coucher moyenne : on compte en minutes autour de midi pour que 23:30 et 00:30 donnent minuit. */
export function avgBedtime(beds: string[]): string | undefined {
  const v = beds.filter(isHHmm).map((b) => {
    const m = toMin(b);
    return m < 12 * 60 ? m + 24 * 60 : m;
  });
  if (!v.length) return undefined;
  const avg = Math.round(v.reduce((a, b) => a + b, 0) / v.length) % (24 * 60);
  return `${String(Math.floor(avg / 60)).padStart(2, '0')}:${String(avg % 60).padStart(2, '0')}`;
}

const filled = (a?: string[]) => (a || []).filter((x) => x && x.trim()).length;
export const morningDone = (f?: FiveMinute) => !!f && (filled(f.grateful) > 0 || filled(f.great) > 0 || !!f.affirmation?.trim());
export const eveningDone = (f?: FiveMinute) => !!f && (filled(f.amazing) > 0 || !!f.better?.trim());
/** Nombre de champs remplis sur 11 (3 gratitudes, 3 intentions, 1 affirmation, 3 belles choses, 1 amélioration). */
export function fmjFilled(f?: FiveMinute) {
  if (!f) return 0;
  return filled(f.grateful) + filled(f.great) + (f.affirmation?.trim() ? 1 : 0) + filled(f.amazing) + (f.better?.trim() ? 1 : 0);
}
export const FMJ_TOTAL = 11;

/** Série de jours consécutifs (jusqu'à aujourd'hui ou hier) avec au moins une partie du Five Minute Journal. */
export function fmjStreak(logs: DayLog[], today: string, addDays: (d: string, n: number) => string) {
  const done = new Set(logs.filter((l) => !l.deleted && (morningDone(l.fmj) || eveningDone(l.fmj))).map((l) => l.date));
  let d = done.has(today) ? today : addDays(today, -1);
  let n = 0;
  while (done.has(d)) {
    n++;
    d = addDays(d, -1);
  }
  return n;
}

/** Inspirations douces pour les champs vides, choisies selon le jour (stables dans la journée). */
const GRATEFUL_HINTS = ['un café chaud au soleil', 'un message qui m’a fait sourire', 'mon lit tout propre', 'une amie qui m’écoute', 'Austin qui m’attend', 'une playlist parfaite', 'un fou rire', 'ma santé', 'un bon repas', 'un moment juste pour moi'];
const GREAT_HINTS = ['boire mon matcha tranquille', 'finir une tâche importante', 'appeler maman', 'aller marcher 20 minutes', 'me coucher avant minuit', 'ranger un coin de l’appart', 'lire quelques pages', 'dire non sans culpabiliser'];
const AFFIRM_HINTS = ['I am enough.', 'I am calm and in control.', 'I attract good things.', 'I am proud of who I am becoming.', 'I trust my timing.', 'I deserve rest and softness.', 'I am magnetic.', 'I choose peace over perfection.'];
const pick = (arr: string[], seed: number, k: number) => arr[(seed + k * 7) % arr.length];
export function hints(date: string) {
  const seed = Number(date.replace(/-/g, '')) % 997;
  return {
    grateful: [0, 1, 2].map((k) => pick(GRATEFUL_HINTS, seed, k)),
    great: [0, 1, 2].map((k) => pick(GREAT_HINTS, seed, k)),
    affirmation: pick(AFFIRM_HINTS, seed, 0),
  };
}
