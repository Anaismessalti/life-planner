// Relire ses journées : tout ce qu'on a écrit (texte, moment fort, commentaires des activités, 5 minutes), en entier et cherchable.
import type { DayLog, ISODate } from '../db/types';

export interface ReadComment {
  trackerId: string;
  name: string;
  color: string;
  detail: string;
  with: string[];
}

export interface ReadDay {
  date: ISODate;
  mood?: number;
  title?: string;
  highlight?: string;
  text?: string;
  comments: ReadComment[];
  grateful: string[];
  amazing: string[];
  better?: string;
  win?: string;
  /** Texte de recherche, sans accents ni majuscules. */
  hay: string;
}

/** « Été », « ete » et « ÉTÉ » se retrouvent. */
export const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

const clean = (a?: string[]) => (a || []).map((x) => x.trim()).filter(Boolean);

export function readDay(l: DayLog, tracker: (id: string) => { name: string; color: string } | undefined, contact: (id: string) => string | undefined): ReadDay {
  const comments = l.items
    .filter((i) => i.detail?.trim())
    .map((i) => {
      const t = tracker(i.trackerId);
      return {
        trackerId: i.trackerId,
        name: t?.name || 'Activité',
        color: t?.color || '#C7A0C9',
        detail: i.detail!.trim(),
        with: [...(i.people || []), ...(i.places || [])].map(contact).filter(Boolean) as string[],
      };
    });
  const d: Omit<ReadDay, 'hay'> = {
    date: l.date,
    mood: l.mood,
    title: l.title?.trim() || undefined,
    highlight: l.highlight?.trim() || undefined,
    text: l.text?.trim() || undefined,
    comments,
    grateful: clean(l.fmj?.grateful),
    amazing: clean(l.fmj?.amazing),
    better: l.fmj?.better?.trim() || undefined,
    win: l.review?.win?.trim() || undefined,
  };
  const words = [d.title, d.highlight, d.text, d.better, d.win, ...d.grateful, ...d.amazing, ...comments.flatMap((c) => [c.name, c.detail, ...c.with])];
  return { ...d, hay: fold(words.filter(Boolean).join(' \n ')) };
}

/** A-t-on écrit quelque chose ce jour-là ? (une case cochée seule ne se relit pas) */
export const hasWords = (d: ReadDay) => !!(d.title || d.highlight || d.text || d.comments.length || d.grateful.length || d.amazing.length || d.better || d.win);

/** Les journées à relire, de la plus récente à la plus ancienne ; chaque mot cherché doit s'y trouver. */
export function rereadDays(days: ReadDay[], query = '', only?: (d: ReadDay) => boolean): ReadDay[] {
  const terms = fold(query).split(/\s+/).filter(Boolean);
  return days
    .filter((d) => hasWords(d) && (!only || only(d)) && terms.every((t) => d.hay.includes(t)))
    .sort((a, b) => b.date.localeCompare(a.date));
}

/** Découpe un texte pour surligner les mots cherchés (sans tenir compte des accents). */
export function splitMatches(text: string, query: string): { s: string; hit: boolean }[] {
  const terms = fold(query).split(/\s+/).filter((t) => t.length >= 2);
  if (!terms.length) return [{ s: text, hit: false }];
  const f = fold(text);
  // fold() garde la longueur pour les lettres accentuées courantes (é → e) : les positions correspondent.
  if (f.length !== text.length) return [{ s: text, hit: false }];
  const marks = new Array(text.length).fill(false);
  for (const t of terms) {
    let i = f.indexOf(t);
    while (i >= 0) {
      for (let k = i; k < i + t.length; k++) marks[k] = true;
      i = f.indexOf(t, i + t.length);
    }
  }
  const out: { s: string; hit: boolean }[] = [];
  for (let i = 0; i < text.length; i++) {
    const last = out[out.length - 1];
    if (last && last.hit === marks[i]) last.s += text[i];
    else out.push({ s: text[i], hit: marks[i] });
  }
  return out;
}
