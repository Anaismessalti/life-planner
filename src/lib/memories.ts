// Souvenirs : « Ce jour-là » (il y a une semaine, un mois, un an) et la photo du jour compressée sur l'appareil.
import type { DayLog, ISODate } from '../db/types';
import { addDays } from './dates';

/** Une journée vaut souvenir si elle garde quelque chose de parlant (pas seulement une case cochée). */
export const isMemorable = (l?: DayLog) => !!l && !l.deleted && !!(l.highlight?.trim() || l.title?.trim() || l.text?.trim() || l.mood || l.items.length);

/** Même jour, n mois plus tôt (le 31 mars → le 28 ou 29 février). */
export function monthsAgo(d: ISODate, n: number): ISODate {
  const [y, m, day] = d.split('-').map(Number);
  const total = y * 12 + (m - 1) - n;
  const yy = Math.floor(total / 12);
  const mm = (total % 12) + 1;
  const last = new Date(Date.UTC(yy, mm, 0)).getUTCDate();
  return `${yy}-${String(mm).padStart(2, '0')}-${String(Math.min(day, last)).padStart(2, '0')}`;
}

export interface Memory {
  key: 'week' | 'month' | 'year' | 'random';
  label: string;
  date: ISODate;
  log: DayLog;
}

/**
 * Les souvenirs à remontrer aujourd'hui. Toujours les mêmes pour une date donnée (pas de hasard d'un affichage à l'autre).
 * S'il n'y a rien à ces dates précises, un jour marquant plus ancien (au moins 2 semaines) est proposé.
 */
export function onThisDay(logs: DayLog[], today: ISODate): Memory[] {
  const by = new Map(logs.filter((l) => !l.deleted).map((l) => [l.date, l]));
  const out: Memory[] = [];
  const add = (key: Memory['key'], label: string, date: ISODate) => {
    const log = by.get(date);
    if (isMemorable(log)) out.push({ key, label, date, log: log! });
  };
  add('week', 'Il y a une semaine', addDays(today, -7));
  add('month', 'Il y a un mois', monthsAgo(today, 1));
  add('year', 'Il y a un an', monthsAgo(today, 12));
  if (!out.length) {
    const old = logs
      .filter((l) => !l.deleted && l.date <= addDays(today, -14) && (l.highlight?.trim() || l.title?.trim() || l.text?.trim()))
      .sort((a, b) => a.date.localeCompare(b.date));
    if (old.length) {
      const seed = [...today].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);
      const pick = old[seed % old.length];
      out.push({ key: 'random', label: 'Un souvenir', date: pick.date, log: pick });
    }
  }
  return out;
}

/** Ce qu'on affiche d'un souvenir : le titre, sinon le moment fort, sinon le début du texte, sinon les activités. */
export function memoryLine(l: DayLog, names: (trackerId: string) => string | undefined): string {
  if (l.title?.trim()) return l.title.trim();
  if (l.highlight?.trim()) return l.highlight.trim();
  if (l.text?.trim()) return l.text.trim().split('\n')[0].slice(0, 90);
  const acts = l.items.map((i) => names(i.trackerId)).filter(Boolean) as string[];
  return acts.length ? acts.slice(0, 3).join(' · ') : '';
}

/**
 * Réduit une photo sur l'appareil (aucun envoi ailleurs) : 1080 px au plus grand côté, JPEG,
 * qualité baissée jusqu'à passer sous ~180 Ko, pour rester dans l'espace gratuit de la synchronisation.
 */
export async function compressPhoto(file: Blob, maxSide = 1080, maxBytes = 180_000): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((res, rej) => {
      const i = new Image();
      i.onload = () => res(i);
      i.onerror = () => rej(new Error('image'));
      i.src = url;
    });
    let side = maxSide;
    for (let attempt = 0; attempt < 6; attempt++) {
      const k = Math.min(1, side / Math.max(img.naturalWidth, img.naturalHeight));
      const w = Math.max(1, Math.round(img.naturalWidth * k));
      const h = Math.max(1, Math.round(img.naturalHeight * k));
      const c = document.createElement('canvas');
      c.width = w;
      c.height = h;
      c.getContext('2d')!.drawImage(img, 0, 0, w, h);
      for (const q of [0.78, 0.68, 0.58]) {
        const data = c.toDataURL('image/jpeg', q);
        // longueur base64 ≈ 4/3 des octets
        if ((data.length * 3) / 4 <= maxBytes) return data;
      }
      side = Math.round(side * 0.8);
    }
    throw new Error('Photo trop lourde');
  } finally {
    URL.revokeObjectURL(url);
  }
}
