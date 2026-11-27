import { describe, expect, it } from 'vitest';
import type { Task } from '../src/db/types';
import { expandTasks, isMultiDay, needsOutcome, spansDay, stayDay } from '../src/lib/tasks';
import { upcoming } from '../src/lib/weekly';
import { buildICS } from '../src/lib/ics';
import { create, db } from '../src/db/db';
import { addDays, todayISO } from '../src/lib/dates';

const T = (id: string, extra: Partial<Task> = {}): Task => ({ id, kind: 'event', title: id, priority: 'should', subtasks: [], status: 'todo', createdAt: 1, updatedAt: 1, ...extra }) as Task;
const lyna = T('lyna', { title: 'Arrivée Lyna', date: '2026-12-04', endDate: '2026-12-06', time: '18:30' });

describe('Séjours sur plusieurs jours', () => {
  it('un séjour couvre chaque jour, du premier au dernier inclus', () => {
    expect(isMultiDay(lyna)).toBe(true);
    expect(['2026-12-03', '2026-12-04', '2026-12-05', '2026-12-06', '2026-12-07'].map((d) => spansDay(lyna, d))).toEqual([false, true, true, true, false]);
    expect(stayDay(lyna, '2026-12-05')).toMatchObject({ n: 2, total: 3 });
    expect(isMultiDay(T('x', { date: '2026-12-04', endDate: '2026-12-04' }))).toBe(false);
    expect(isMultiDay(T('x', { kind: 'task', date: '2026-12-04', endDate: '2026-12-06' }))).toBe(false);
  });

  it('apparaît dans une période qui ne contient que la fin du séjour', () => {
    expect(expandTasks([lyna], '2026-12-06', '2026-12-10').map((t) => t.id)).toEqual(['lyna']);
    expect(expandTasks([lyna], '2026-12-07', '2026-12-10')).toEqual([]);
  });

  it('ne demande « a eu lieu ? » qu’une fois le séjour terminé', () => {
    expect(needsOutcome(lyna, '2026-12-05', 23 * 60)).toBe(false);
    expect(needsOutcome(lyna, '2026-12-06', 23 * 60)).toBe(false);
    expect(needsOutcome(lyna, '2026-12-07')).toBe(true);
  });

  it('la semaine qui vient ne le répète pas chaque jour', () => {
    expect(upcoming([lyna], '2026-12-05').filter((t) => t.id === 'lyna')).toEqual([]);
  });

  it('l’export agenda couvre tout le séjour', async () => {
    await Promise.all(db.tables.map((t) => t.clear()));
    const d = addDays(todayISO(), 3);
    await create('tasks', { kind: 'event', title: 'Voyage', priority: 'should', subtasks: [], status: 'todo', date: d, endDate: addDays(d, 2) } as never);
    const ics = await buildICS();
    expect(ics).toContain(`DTSTART;VALUE=DATE:${d.replace(/-/g, '')}`);
    expect(ics).toContain(`DTEND;VALUE=DATE:${addDays(d, 3).replace(/-/g, '')}`);
  });
});
