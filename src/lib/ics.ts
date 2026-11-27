import { db } from '../db/db';
import { addDays, todayISO, timeToMin } from './dates';
import { financeOccurrencesIn, eur } from './finance';
import { expandTasks, isClosed } from './tasks';

const esc = (s: string) => s.replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/,/g, '\\,').replace(/;/g, '\\;');
const d8 = (iso: string) => iso.replace(/-/g, '');
const stamp = () => new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');

/**
 * Export .ics pour le Calendrier Apple : les rappels natifs d'iOS fonctionnent ensuite
 * même quand le Life Planner est fermé ou hors ligne.
 */
export async function buildICS(remindMin = 30): Promise<string> {
  const from = addDays(todayISO(), -7);
  const to = addDays(todayISO(), 365);
  const tasks = expandTasks(await db.tasks.toArray(), from, to).filter((t) => !isClosed(t) && (t.kind === 'event' || t.time));
  const fin = {
    incomes: (await db.incomes.toArray()).filter((x) => !x.deleted),
    fixed: (await db.fixedExpenses.toArray()).filter((x) => !x.deleted),
    payments: await db.payments.toArray(),
  };
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Life Planner//FR', 'CALSCALE:GREGORIAN', 'X-WR-CALNAME:Life Planner'];
  const ds = stamp();
  for (const t of tasks) {
    // UID fixe + SEQUENCE/LAST-MODIFIED : un nouvel import met à jour le même événement au lieu d'en créer un autre.
    const mod = new Date(t.updatedAt || 1).toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
    lines.push('BEGIN:VEVENT', `UID:${t.id}@life-planner`, `DTSTAMP:${ds}`, `LAST-MODIFIED:${mod}`, `SEQUENCE:${Math.floor((t.updatedAt || 0) / 1000) % 2147483647}`, `SUMMARY:${esc(t.title)}`);
    if (t.time) {
      const s = timeToMin(t.time);
      const e = s + (t.duration || (t.kind === 'event' ? 60 : 30));
      const hm = (m: number) => `${String(Math.floor(m / 60) % 24).padStart(2, '0')}${String(m % 60).padStart(2, '0')}00`;
      if (t.endDate && t.endDate > t.date!) lines.push(`DTSTART:${d8(t.date!)}T${hm(s)}`, `DTEND:${d8(addDays(t.endDate, 1))}T000000`);
      else lines.push(`DTSTART:${d8(t.date!)}T${hm(s)}`, `DTEND:${e >= 1440 ? d8(addDays(t.date!, 1)) + 'T000000' : d8(t.date!) + 'T' + hm(e)}`);
    } else {
      lines.push(`DTSTART;VALUE=DATE:${d8(t.date!)}`, `DTEND;VALUE=DATE:${d8(addDays(t.endDate && t.endDate > t.date! ? t.endDate : t.date!, 1))}`);
    }
    if (t.location) lines.push(`LOCATION:${esc(t.location)}`);
    if (t.description) lines.push(`DESCRIPTION:${esc(t.description)}`);
    const before = t.remindBefore === -1 ? null : (t.remindBefore ?? remindMin);
    if (before !== null) lines.push('BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${esc(t.title)}`, `TRIGGER:-PT${before}M`, 'END:VALARM');
    lines.push('END:VEVENT');
  }
  for (const o of financeOccurrencesIn(fin, todayISO(), to)) {
    if (o.refType !== 'fixed') continue;
    lines.push(
      'BEGIN:VEVENT',
      `UID:${o.refId}_${o.date}@life-planner`,
      `DTSTAMP:${ds}`,
      `SUMMARY:${esc(`Prélèvement ${o.label} · ${eur(o.planned)}`)}`,
      `DTSTART;VALUE=DATE:${d8(o.date)}`,
      `DTEND;VALUE=DATE:${d8(addDays(o.date, 1))}`,
      'BEGIN:VALARM',
      'ACTION:DISPLAY',
      `DESCRIPTION:${esc(o.label)}`,
      'TRIGGER:PT9H',
      'END:VALARM',
      'END:VEVENT',
    );
  }
  lines.push('END:VCALENDAR');
  return lines.join('\r\n');
}
