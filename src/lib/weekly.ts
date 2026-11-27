// Revue du dimanche : la semaine passée en souvenirs et en chiffres, ce qui traîne, la semaine qui vient.
import type { DayLog, ISODate, Task } from '../db/types';
import { addDays, weekStart } from './dates';
import { expandTasks, isOpen, postponeCount, type TaskView } from './tasks';

/** La semaine à revoir : celle qui finit aujourd'hui le dimanche, sinon la dernière semaine terminée. */
export function reviewWeek(today: ISODate): { from: ISODate; to: ISODate } {
  const mon = weekStart(today);
  const sunday = addDays(mon, 6);
  if (today === sunday) return { from: mon, to: sunday };
  return { from: addDays(mon, -7), to: addDays(mon, -1) };
}

/** La carte de revue apparaît le dimanche à partir de 10 h, et le lundi si la revue n'a pas été faite. */
export function reviewDue(today: ISODate, hour: number, logs: DayLog[]): boolean {
  const { from, to } = reviewWeek(today);
  const done = logs.find((l) => l.date === to)?.review?.doneAt;
  if (done) return false;
  const isSunday = today === to;
  const isMonday = today === addDays(to, 1);
  // Rien à revoir si la semaine est restée vide (app toute neuve).
  const any = logs.some((l) => !l.deleted && l.date >= from && l.date <= to);
  return any && ((isSunday && hour >= 10) || isMonday);
}

export interface WeekRecap {
  from: ISODate;
  to: ISODate;
  moments: { date: ISODate; line: string }[];
  daysLogged: number;
  moodAvg?: number;
  tasksDone: number;
  events: number;
  essentials: { chosen: number; done: number };
}

export function weekRecap(logs: DayLog[], all: Task[], from: ISODate, to: ISODate): WeekRecap {
  const inWeek = logs.filter((l) => !l.deleted && l.date >= from && l.date <= to).sort((a, b) => a.date.localeCompare(b.date));
  const moods = inWeek.filter((l) => l.mood).map((l) => l.mood!);
  const views = expandTasks(all, from, to);
  const byId = new Map(views.map((t) => [t.id, t]));
  let chosen = 0;
  let done = 0;
  for (const l of inWeek)
    for (const id of l.essentials || []) {
      chosen++;
      const t = byId.get(id) || all.find((x) => x.id === id);
      if (t && t.status === 'done') done++;
    }
  return {
    from,
    to,
    moments: inWeek.filter((l) => l.title?.trim() || l.highlight?.trim()).map((l) => ({ date: l.date, line: (l.title?.trim() || l.highlight!.trim()) })),
    daysLogged: inWeek.filter((l) => l.mood || l.items.length || l.highlight || l.text).length,
    moodAvg: moods.length ? Math.round((moods.reduce((a, b) => a + b, 0) / moods.length) * 10) / 10 : undefined,
    tasksDone: views.filter((t) => t.kind === 'task' && t.status === 'done').length,
    events: views.filter((t) => t.kind === 'event' && t.outcome === 'happened').length,
    essentials: { chosen, done },
  };
}

/** Ce qui traîne : reportée au moins deux fois, ou échéance dépassée. */
export function lingering(all: Task[], today: ISODate): Task[] {
  return all
    .filter((t) => t.kind === 'task' && isOpen(t) && !t.recurrence && (postponeCount(t) >= 2 || (t.dueDate && t.dueDate < today)))
    .sort((a, b) => postponeCount(b) - postponeCount(a));
}

/** La semaine qui vient : rendez-vous et échéances des 7 prochains jours. */
export function upcoming(all: Task[], today: ISODate): TaskView[] {
  const end = addDays(today, 7);
  const events = expandTasks(all, addDays(today, 1), end).filter((t) => t.kind === 'event' && !t.outcome);
  const due = all.filter((t) => isOpen(t) && t.dueDate && t.dueDate > today && t.dueDate <= end && t.kind === 'task');
  return [...events, ...due].sort((a, b) => ((a.kind === 'event' ? a.date : a.dueDate) || '').localeCompare((b.kind === 'event' ? b.date : b.dueDate) || ''));
}
