// Export Calendrier : deux exports successifs doivent désigner les mêmes événements (aucun doublon à l'import).
import { beforeEach, describe, expect, it } from 'vitest';
import { create, db, update } from '../src/db/db';
import type { Task } from '../src/db/types';
import { buildICS } from '../src/lib/ics';
import { addDays, todayISO } from '../src/lib/dates';

beforeEach(async () => {
  await Promise.all(db.tables.map((t) => t.clear()));
});

const uids = (ics: string) => ics.split('\r\n').filter((l) => l.startsWith('UID:'));
const ev = (ics: string, uid: string) => {
  const lines = ics.split('\r\n');
  const i = lines.indexOf(uid);
  return lines.slice(i, lines.indexOf('END:VEVENT', i));
};

describe('export .ics', () => {
  it('identifiants uniques et identiques d’un export à l’autre, mise à jour plutôt que doublon', async () => {
    const d = addDays(todayISO(), 2);
    const a = await create<Task>('tasks', { kind: 'event', title: 'Dîner; Léa, Yasmine', date: d, time: '20:00', priority: 'should', subtasks: [], status: 'todo' });
    await create<Task>('tasks', { kind: 'event', title: 'Pilates', date: todayISO(), time: '18:00', priority: 'should', subtasks: [], status: 'todo', recurrence: { freq: 'weekly', interval: 1 } });
    const one = await buildICS();
    const two = await buildICS();
    expect(uids(one).length).toBeGreaterThan(50); // Pilates chaque semaine pendant un an
    expect(new Set(uids(one)).size).toBe(uids(one).length);
    expect(uids(two)).toEqual(uids(one));
    expect(one).toContain('SUMMARY:Dîner\\; Léa\\, Yasmine');

    const uid = `UID:${a.id}@life-planner`;
    const seq1 = Number(ev(one, uid).find((l) => l.startsWith('SEQUENCE:'))!.slice(9));
    await new Promise((r) => setTimeout(r, 1100));
    await update<Task>('tasks', a.id, { date: addDays(d, 1) });
    const three = await buildICS();
    expect(uids(three).filter((u) => u === uid)).toHaveLength(1);
    expect(ev(three, uid).some((l) => l.startsWith(`DTSTART:${addDays(d, 1).replace(/-/g, '')}`))).toBe(true);
    expect(Number(ev(three, uid).find((l) => l.startsWith('SEQUENCE:'))!.slice(9))).toBeGreaterThan(seq1);
  });
});
