// Audit des quatre experts (28/11/2026) : données entre appareils, séries, reports, statistiques honnêtes.
import { beforeEach, describe, expect, it } from 'vitest';
import { create, db, quietly, update } from '../src/db/db';
import type { DayLog, Task } from '../src/db/types';
import { reschedule } from '../src/lib/agenda';
import { mergeRecords } from '../src/lib/sync/merge';
import { editSeriesFrom, expandTasks, postponeCount, runRollover } from '../src/lib/tasks';
import { saveLog } from '../src/pages/Journal';

beforeEach(async () => {
  await Promise.all(db.tables.map((t) => t.clear()));
});

describe('synchronisation : une journée créée sur deux appareils', () => {
  it('un toucher sur le 2e appareil n’efface pas l’humeur, le texte et les activités du 1er', async () => {
    // Le Mac a noté la journée le matin…
    const mac: DayLog = { id: '2026-11-28', date: '2026-11-28', items: [{ trackerId: 'tr-cafe' }], mood: 4, text: 'Café avec Léa', createdAt: 1000, updatedAt: 1000, _ts: { date: 1000, items: 1000, mood: 1000, text: 1000 } };
    // … l'iPhone, pas encore synchronisé, ne note que la note du soir.
    await saveLog('2026-11-28', { score: 7 });
    const phone = (await db.daylogs.get('2026-11-28'))!;
    const merged = mergeRecords(phone, mac);
    expect(merged).toMatchObject({ mood: 4, text: 'Café avec Léa', score: 7, items: [{ trackerId: 'tr-cafe' }] });
    expect(mergeRecords(mac, phone)).toMatchObject({ mood: 4, text: 'Café avec Léa', score: 7, items: [{ trackerId: 'tr-cafe' }] });
  });

  it('une migration au démarrage ne l’emporte pas sur une modification plus récente faite ailleurs', async () => {
    await create('settings', { id: 'habits', value: ['tr-sport', 'tr-meditation'] } as any);
    const before = (await db.settings.get('habits'))!;
    await quietly(() => update('settings', 'habits', { value: ['tr-sport'] } as any));
    const after = (await db.settings.get('habits'))!;
    expect(after._ts!.value).toBe(before._ts!.value + 1);
    // l'autre appareil a changé ses habitudes entre-temps (plus récent) : il gagne
    const remote = { ...before, value: ['tr-sport', 'tr-lecture'], _ts: { ...before._ts, value: before._ts!.value + 1000 } };
    expect(mergeRecords(after, remote).value).toEqual(['tr-sport', 'tr-lecture']);
  });
});

describe('tâches récurrentes', () => {
  const series = (p: Partial<Task> = {}) =>
    create<Task>('tasks', { kind: 'task', title: 'Ménage', priority: 'should', subtasks: [], status: 'todo', date: '2026-11-02', recurrence: { freq: 'weekly', interval: 1 }, ...p } as any);

  it('une occurrence manquée n’atterrit jamais dans « Plus tard » : elle passe quand la suivante arrive', async () => {
    const s = await series();
    await runRollover('2026-11-03');
    for (const d of ['2026-11-04', '2026-11-05', '2026-11-06', '2026-11-07', '2026-11-08']) await runRollover(d);
    const occ = (await db.tasks.toArray()).filter((t) => t.seriesId === s.id);
    expect(occ.every((t) => !!t.date || t.outcome === 'skipped')).toBe(true);
    await runRollover('2026-11-09');
    const first = (await db.tasks.toArray()).find((t) => t.seriesId === s.id && t.originalDate === '2026-11-02');
    expect(first?.outcome).toBe('skipped');
  });

  it('modifier la série « pour la suite » garde le passé intact', async () => {
    const s = await series();
    await editSeriesFrom(s.id, '2026-11-20', { title: 'Grand ménage', recurrence: { freq: 'weekly', interval: 1, byWeekday: [4] } });
    const all = await db.tasks.toArray();
    const oct = expandTasks(all, '2026-11-01', '2026-11-19');
    expect(oct.map((t) => t.date)).toEqual(['2026-11-02', '2026-11-09', '2026-11-16']);
    expect(oct.every((t) => t.title === 'Ménage')).toBe(true);
    const next = expandTasks(all, '2026-11-20', '2026-12-06');
    expect(next.every((t) => t.title === 'Grand ménage')).toBe(true);
    expect(next.map((t) => t.date)).toEqual(['2026-11-26', '2026-12-03']);
  });
});

describe('reports', () => {
  it('avancer une tâche n’est pas un report', async () => {
    const t = await create<Task>('tasks', { kind: 'task', title: 'Dossier', priority: 'should', subtasks: [], status: 'todo', date: '2026-12-10' } as any);
    const moved = await reschedule(t, '2026-12-01', undefined, '2026-11-28');
    expect(postponeCount(moved)).toBe(0);
    const later = await reschedule(moved, '2026-12-05', undefined, '2026-11-28');
    expect(postponeCount(later)).toBe(1);
  });
});
