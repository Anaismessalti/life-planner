import type { HHmm, ISODate, Priority } from '../db/types';
import { addDays, todayISO, weekday } from './dates';

const DAYS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];

/**
 * Comprend quelques mots simples dans une saisie rapide (aucune IA, tout est local) :
 * « demain », « aujourd'hui », « après-demain », un jour de la semaine, « 14h », « 14h30 », « 9:15 »,
 * et « ! » ou « urgent » pour une priorité essentielle. Fonctionne aussi avec la dictée vocale.
 */
const EVENT_WORDS = /(?:^|[^\p{L}])(rdv|rendez[- ]vous|entretien|réunion|reunion|meeting|visio|dentiste|médecin|medecin|docteur|kiné|kine|gynéco|gyneco|ophtalmo|dermato|coiffeur|esthéticienne|dîner|diner|déjeuner|dejeuner|brunch|apéro|apero|anniversaire|cours|séance|seance|vol|train)(?=$|[^\p{L}])/iu;

const MONTHS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
const MONTH_RE = '(janv(?:ier)?|f[ée]v(?:rier)?|mars|avr(?:il)?|mai|juin|juil(?:let)?|ao[uû]t|sept(?:embre)?|oct(?:obre)?|nov(?:embre)?|d[ée]c(?:embre)?)';
const fold = (x: string) => x.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const monthIndex = (m: string) => MONTHS.findIndex((x) => fold(x).startsWith(fold(m).slice(0, 3)));
const pad = (n: number) => String(n).padStart(2, '0');
/** Une date sans année est la prochaine à venir (« le 2 janvier » tapé en décembre = l'an prochain). */
function nextDate(day: number, month: number, today: ISODate, year?: number): ISODate | undefined {
  let y = year ?? Number(today.slice(0, 4));
  const make = (yy: number) => {
    const last = new Date(Date.UTC(yy, month + 1, 0)).getUTCDate();
    return day >= 1 && day <= last ? `${yy}-${pad(month + 1)}-${pad(day)}` : undefined;
  };
  let d = make(y);
  if (!d) return undefined;
  if (year === undefined && d < today) d = make(++y);
  return d;
}

export function parseQuick(
  input: string,
  today: ISODate = todayISO(),
): { title: string; date?: ISODate; time?: HHmm; duration?: number; priority?: Priority; kind?: 'task' | 'event' } {
  let s = ` ${input.trim().replace(/(\S)(!+)(?=\s|$)/g, '$1 $2')} `;
  let date: ISODate | undefined;
  let time: HHmm | undefined;
  let duration: number | undefined;
  let priority: Priority | undefined;
  const take = (re: RegExp) => {
    const m = s.match(re);
    if (m) s = s.replace(re, ' ');
    return m;
  };
  const hhmm = (h: number, mi: number) => (h < 24 && mi < 60 ? `${pad(h)}:${pad(mi)}` : undefined);
  if (take(/\s(après[- ]demain)\s/i)) date = addDays(today, 2);
  else if (take(/\s(demain)\s/i)) date = addDays(today, 1);
  else if (take(/\s(aujourd'hui|aujourd’hui|ce soir)\s/i)) date = today;
  else {
    // « le 15 décembre », « 2 déc. 2027 », « 15/12 », « 15/12/2026 »
    const full = take(new RegExp(`\\s(?:le\\s)?(\\d{1,2})(?:er)?\\s${MONTH_RE}\\.?(?:\\s(\\d{4}))?(?=\\s)`, 'iu'));
    const slash = !full && take(/\s(?:le\s)?(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?(?=\s)/);
    if (full) date = nextDate(Number(full[1]), monthIndex(full[2]), today, full[3] ? Number(full[3]) : undefined);
    else if (slash) {
      const y = slash[3] ? (slash[3].length === 2 ? 2000 + Number(slash[3]) : Number(slash[3])) : undefined;
      date = nextDate(Number(slash[1]), Number(slash[2]) - 1, today, y);
    } else {
      const m = take(new RegExp(`\\s(?:ce |le )?(${DAYS.join('|')})(?: prochain)?\\s`, 'i'));
      if (m) {
        const target = DAYS.indexOf(m[1].toLowerCase());
        let diff = (target - weekday(today) + 7) % 7;
        if (diff === 0) diff = 7;
        date = addDays(today, diff);
      } else {
        // « le 15 » : le prochain 15 du mois
        const d = take(/\s(?:le)\s(\d{1,2})(?:er)?(?=\s)/i);
        if (d) {
          const n = Number(d[1]);
          const [y, mo] = today.split('-').map(Number);
          date = nextDate(n, mo - 1, today, y) && nextDate(n, mo - 1, today, y)! >= today ? nextDate(n, mo - 1, today, y) : nextDate(n, mo % 12, today, mo === 12 ? y + 1 : y);
        }
      }
    }
  }
  // Plage horaire : « de 18h à 19h30 », « 14h-15h »
  const range = take(/\s(?:de\s)?(\d{1,2})\s?h\s?(\d{2})?\s?(?:-|–|à)\s?(\d{1,2})\s?h\s?(\d{2})?(?=\s)/i);
  if (range) {
    time = hhmm(Number(range[1]), Number(range[2] || 0));
    const end = Number(range[3]) * 60 + Number(range[4] || 0);
    const start = Number(range[1]) * 60 + Number(range[2] || 0);
    if (time && end > start) duration = end - start;
  } else {
    // Durée : « 1h », « 2h30 », « 45 min », « pendant 2h » (une heure seule avant 6 h, sans « à », est une durée).
    const mins = take(/\s(?:pendant\s)?(\d{1,3})\s?min(?:utes?)?(?=\s)/i);
    if (mins) duration = Number(mins[1]);
    const t = s.match(/\s(à\s)?(\d{1,2})\s?(?:h|:)\s?(\d{2})?(?=\s)/i);
    if (t) {
      const h = Number(t[2]);
      const isDuration = !t[1] && (/\spendant\s*$/i.test(s.slice(0, t.index! + 1)) || (h >= 1 && h <= 5 && !/:/.test(t[0])));
      s = s.replace(t[0], ' ').replace(/\spendant\s/i, ' ');
      if (isDuration) duration = h * 60 + Number(t[3] || 0);
      else time = hhmm(h, Number(t[3] || 0));
    }
  }
  if (take(/\s(!+|urgent)\s/i)) priority = 'must';
  else if (take(/\s(~|sans urgence)\s/i)) priority = 'could';
  else if (take(/\s(vite|rapidement|asap)\s/i)) priority = 'should';
  const title = s.replace(/\s+/g, ' ').replace(/\s(de|à|le)$/i, '').trim();
  // Un rendez-vous reconnu (« entretien », « dentiste », « rdv »…) avec une heure ou une date précise devient un rendez-vous fixe
  // … sauf s'il s'agit d'une démarche à faire (« prendre rdv chez le dentiste », « appeler le médecin »).
  const chore = /(?:^|[^\p{L}])(prendre|appeler|rappeler|réserver|reserver|annuler|décaler|decaler|booker)(?=$|[^\p{L}])/iu.test(input);
  const kind = (time || date) && !chore && EVENT_WORDS.test(input) ? 'event' : undefined;
  return { title: title ? title.charAt(0).toUpperCase() + title.slice(1) : input.trim(), date, time, duration, priority, kind };
}
