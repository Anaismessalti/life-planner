import type { HHmm, ISODate, Priority } from '../db/types';
import { addDays, todayISO, weekday } from './dates';

const DAYS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];

/**
 * Comprend quelques mots simples dans une saisie rapide (aucune IA, tout est local) :
 * « demain », « aujourd'hui », « après-demain », un jour de la semaine, « 14h », « 14h30 », « 9:15 »,
 * et « ! » ou « urgent » pour une priorité essentielle. Fonctionne aussi avec la dictée vocale.
 */
const EVENT_WORDS = /(?:^|[^\p{L}])(rdv|rendez[- ]vous|entretien|réunion|reunion|meeting|visio|dentiste|médecin|medecin|docteur|kiné|kine|gynéco|gyneco|ophtalmo|dermato|coiffeur|esthéticienne|dîner|diner|déjeuner|dejeuner|brunch|apéro|apero|anniversaire|cours|séance|seance|vol|train)(?=$|[^\p{L}])/iu;

export function parseQuick(input: string, today: ISODate = todayISO()): { title: string; date?: ISODate; time?: HHmm; priority?: Priority; kind?: 'task' | 'event' } {
  let s = ` ${input.trim()} `;
  let date: ISODate | undefined;
  let time: HHmm | undefined;
  let priority: Priority | undefined;
  const take = (re: RegExp) => {
    const m = s.match(re);
    if (m) s = s.replace(re, ' ');
    return m;
  };
  if (take(/\s(après[- ]demain)\s/i)) date = addDays(today, 2);
  else if (take(/\s(demain)\s/i)) date = addDays(today, 1);
  else if (take(/\s(aujourd'hui|aujourd’hui|ce soir)\s/i)) date = today;
  else {
    const m = take(new RegExp(`\\s(?:ce |le )?(${DAYS.join('|')})(?: prochain)?\\s`, 'i'));
    if (m) {
      const target = DAYS.indexOf(m[1].toLowerCase());
      let diff = (target - weekday(today) + 7) % 7;
      if (diff === 0) diff = 7;
      date = addDays(today, diff);
    }
  }
  const t = take(/\s(?:à\s)?(\d{1,2})\s?(?:h|:)\s?(\d{2})?\s/i);
  if (t) {
    const h = Number(t[1]);
    const mi = Number(t[2] || 0);
    if (h < 24 && mi < 60) time = `${String(h).padStart(2, '0')}:${String(mi).padStart(2, '0')}`;
  }
  if (take(/\s(!+|urgent)\s/i)) priority = 'must';
  else if (take(/\s(~|sans urgence)\s/i)) priority = 'could';
  else if (take(/\s(vite|rapidement|asap)\s/i)) priority = 'should';
  const title = s.replace(/\s+/g, ' ').trim();
  // Un rendez-vous reconnu (« entretien », « dentiste », « rdv »…) avec une heure devient un rendez-vous fixe
  // … sauf s'il s'agit d'une démarche à faire (« prendre rdv chez le dentiste », « appeler le médecin »).
  const chore = /(?:^|[^\p{L}])(prendre|appeler|rappeler|réserver|reserver|annuler|décaler|decaler|booker)(?=$|[^\p{L}])/iu.test(input);
  const kind = time && !chore && EVENT_WORDS.test(input) ? 'event' : undefined;
  return { title: title ? title.charAt(0).toUpperCase() + title.slice(1) : input.trim(), date, time, priority, kind };
}
