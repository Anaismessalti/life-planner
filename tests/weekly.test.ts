import { describe, expect, it } from 'vitest';
import type { DayLog, Task } from '../src/db/types';
import { lingering, reviewDue, reviewWeek, upcoming, weekRecap } from '../src/lib/weekly';
import { periodMoments } from '../src/lib/memories';

const L = (date: string, extra: Partial<DayLog> = {}): DayLog => ({ id: date, date, items: [], createdAt: 1, updatedAt: 1, ...extra });
const T = (id: string, extra: Partial<Task> = {}): Task => ({ id, kind: 'task', title: id, priority: 'should', subtasks: [], status: 'todo', createdAt: 1, updatedAt: 1, ...extra }) as Task;

describe('Revue du dimanche', () => {
  it('le dimanche revoit la semaine en cours, les autres jours la dernière semaine finie', () => {
    expect(reviewWeek('2026-11-29')).toEqual({ from: '2026-11-23', to: '2026-11-29' }); // dimanche
    expect(reviewWeek('2026-11-30')).toEqual({ from: '2026-11-23', to: '2026-11-29' }); // lundi
    expect(reviewWeek('2026-11-27')).toEqual({ from: '2026-11-16', to: '2026-11-22' });
  });

  it('proposée le dimanche dès 10 h et le lundi, plus une fois faite', () => {
    const logs = [L('2026-11-25', { mood: 4 })];
    expect(reviewDue('2026-11-29', 9, logs)).toBe(false);
    expect(reviewDue('2026-11-29', 10, logs)).toBe(true);
    expect(reviewDue('2026-11-30', 8, logs)).toBe(true);
    expect(reviewDue('2026-12-01', 8, logs)).toBe(false);
    expect(reviewDue('2026-11-30', 8, [...logs, L('2026-11-29', { review: { doneAt: 1 } })])).toBe(false);
    expect(reviewDue('2026-11-29', 12, [])).toBe(false); // semaine vide : rien à revoir
  });

  it('récapitule moments forts, humeur, tâches faites et essentiels tenus', () => {
    const logs = [L('2026-11-24', { mood: 4, highlight: 'Pique-nique', essentials: ['a', 'b'] }), L('2026-11-26', { mood: 2, title: 'Le jour du rhume' })];
    const all = [T('a', { date: '2026-11-24', status: 'done' }), T('b', { date: '2026-11-24' }), T('c', { date: '2026-11-25', status: 'done' })];
    const r = weekRecap(logs, all, '2026-11-23', '2026-11-29');
    expect(r.moments.map((m) => m.line)).toEqual(['Pique-nique', 'Le jour du rhume']);
    expect(r.moodAvg).toBe(3);
    expect(r.tasksDone).toBe(2);
    expect(r.essentials).toEqual({ chosen: 2, done: 1 });
  });

  it('ce qui traîne : reportée 2 fois ou échéance passée ; à venir : rendez-vous et échéances des 7 jours', () => {
    const all = [
      T('reportee', { date: '2026-11-29', postponeCount: 2 }),
      T('echue', { date: '2026-11-29', dueDate: '2026-11-25' }),
      T('normale', { date: '2026-11-29' }),
      T('rdv', { kind: 'event', date: '2026-12-02', time: '10:00' }),
      T('rendu', { dueDate: '2026-12-04' }),
      T('loin', { kind: 'event', date: '2026-12-20' }),
    ];
    expect(lingering(all, '2026-11-29').map((t) => t.id).sort()).toEqual(['echue', 'reportee']);
    expect(upcoming(all, '2026-11-29').map((t) => t.id)).toEqual(['rdv', 'rendu']);
  });
});

describe('Bilans en souvenirs', () => {
  it('les moments forts les plus lumineux d’abord', () => {
    const logs = [L('2026-11-02', { mood: 3, highlight: 'Café avec Léa' }), L('2026-11-10', { mood: 5, title: 'Le concert' }), L('2026-11-12', { mood: 5, score: 9, highlight: 'Demande en fiançailles de Sarah' }), L('2026-11-15', { mood: 5 })];
    expect(periodMoments(logs, '2026-11-01', '2026-11-30').map((m) => m.date)).toEqual(['2026-11-12', '2026-11-10', '2026-11-02']);
  });
});
